#!/usr/bin/env python3
"""
Tracking Middleware Stress Test Runner — SMP-552.8
Runs tracking_middleware.js against the dev stack via Docker.

Usage:
    python k6/stress_test/run_tracking_middleware.py

Environment (optional .env or shell exports):
    K6_TEST_USER_EMAIL     test user email (must exist in DB)
    K6_TEST_USER_PASSWORD  test user password
    K6_BASE_URL            defaults to http://backend-dev:8000 (container-to-container)
    K6_SKIP_CONFIRM        set to 'true' to skip the confirmation prompt
    K6_ABORT_ON_FAIL       set to 'true' to abort if thresholds are breached
"""

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


def load_env_file(env_path):
    env_vars = {}
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip()
    return env_vars


def verify_backend_ready(compose_file):
    print("=" * 60)
    print("Pre-flight: verifying backend connectivity")
    print("=" * 60)

    print("\n[1/2] Checking backend-dev container...")
    try:
        r = subprocess.run(
            ['docker', 'ps', '--filter', 'name=backend-dev', '--format', '{{.Names}}'],
            capture_output=True, text=True, check=False,
        )
        if 'backend-dev' not in r.stdout:
            print("ERROR: backend-dev is not running")
            print(f"  docker compose -f {compose_file} up -d backend")
            return False
        print("  backend-dev is running")
    except FileNotFoundError:
        print("ERROR: docker not found")
        return False

    print("\n[2/2] Health endpoint http://localhost:8000/health/ ...")
    try:
        req = urllib.request.Request('http://localhost:8000/health/')
        req.add_header('User-Agent', 'K6-Preflight')
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.getcode() == 200:
                print(f"  health check OK ({resp.getcode()})")
            else:
                print(f"  ERROR: health returned {resp.getcode()}")
                return False
    except urllib.error.URLError as exc:
        print(f"  ERROR: cannot reach health endpoint: {exc}")
        return False

    print("\n" + "=" * 60)
    print("Pre-flight passed. Starting k6 ...")
    print("=" * 60 + "\n")
    return True


def main():
    script_dir = Path(__file__).parent.resolve()
    os.chdir(script_dir)

    env_vars = load_env_file(script_dir.parent / '.env')
    for k, v in env_vars.items():
        os.environ.setdefault(k, v)

    k6_base_url = os.environ.get('K6_BASE_URL', 'http://localhost:8000')
    k6_email    = os.environ.get('K6_TEST_USER_EMAIL', '')
    k6_password = os.environ.get('K6_TEST_USER_PASSWORD', '')

    compose_file = script_dir.parent / 'docker-compose.dev.yml'
    if not compose_file.exists():
        print(f"ERROR: docker-compose.dev.yml not found at {compose_file}")
        sys.exit(1)

    if not verify_backend_ready(compose_file):
        print("\nPre-flight failed. Fix issues above and retry.")
        sys.exit(1)

    # Container-to-container URL
    container_url = k6_base_url.replace('localhost:8000', 'backend-dev:8000') \
                                .replace('127.0.0.1:8000', 'backend-dev:8000')

    # Confirmation
    skip_confirm = os.getenv('K6_SKIP_CONFIRM', 'false').lower() == 'true'
    if not skip_confirm:
        print("This test ramps to 500 VUs. It will create significant load.")
        print("Type 'yes' to continue, anything else to cancel.")
        if input("Continue? [yes/no]: ").strip().lower() not in ('yes', 'y'):
            print("Cancelled.")
            sys.exit(0)
        print()

    abort_on_fail = os.getenv('K6_ABORT_ON_FAIL', 'false').lower() == 'true'

    k6_args = [
        'run',
        '--out', 'json=/tmp/tracking-middleware-result.json',
    ]
    if abort_on_fail:
        k6_args.append('--abort-on-fail')
    k6_args.append('/k6/stress_test/tracking_middleware.js')

    # Mount the entire k6 directory so stress_test/ imports from ../scripts/ resolve.
    k6_dir = str(script_dir.parent)
    docker_cmd = [
        'docker', 'run', '--rm',
        '--network', 'marketing-simplified_default',
        '-v', f'{k6_dir}:/k6:ro',
        '-e', f'K6_BASE_URL={container_url}',
        '-e', f'K6_TEST_USER_EMAIL={k6_email}',
        '-e', f'K6_TEST_USER_PASSWORD={k6_password}',
        'grafana/k6:latest',
    ] + k6_args

    print("=" * 60)
    print("TRACKING MIDDLEWARE STRESS TEST — SMP-552.8")
    print("Stages: 50 VU → 200 VU → 500 VU, 1 min each")
    print(f"Target: {container_url}/api/tasks/<id>/")
    print("Thresholds: error rate < 1 %  |  p95 < 300 ms")
    print("=" * 60 + "\n")

    try:
        subprocess.run(docker_cmd, check=True)
        print("\nStress test completed.")
        sys.exit(0)
    except subprocess.CalledProcessError:
        print("\nStress test finished with threshold violations (see output above).")
        sys.exit(1)
    except FileNotFoundError:
        print("ERROR: docker not found")
        sys.exit(1)


if __name__ == '__main__':
    main()
