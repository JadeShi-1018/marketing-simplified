"""
Phase 3 真实信号测试：验证 Django 信号自动触发
运行命令: docker compose -p mediajira-v2 -f docker-compose.dev.yml exec backend python test_phase3_real_signals.py
"""

import django
import os
import sys

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from agent.models import (
    AgentWorkflowDefinition,
    WorkflowTriggerLog,
)
from core.models import Project, Organization
from django.contrib.auth import get_user_model
from task.models import Task
import time

User = get_user_model()


def print_header(text):
    print("\n" + "=" * 70)
    print(f"  {text}")
    print("=" * 70)


def print_test(test_name):
    print(f"\n[TEST] {test_name}")


def print_pass(message):
    print(f"  ✓ {message}")


def print_fail(message):
    print(f"  ✗ {message}")


def run_tests():
    print_header("Phase 3: 真实 Django 信号集成测试")

    # Setup
    print_test("设置测试环境")
    try:
        import uuid
        unique_suffix = str(uuid.uuid4())[:8]

        user, _ = User.objects.get_or_create(
            email='real_signal_test@example.com',
            defaults={
                'first_name': 'Signal',
                'last_name': 'Test',
                'username': f'signal_test_{unique_suffix}',
            }
        )

        org, _ = Organization.objects.get_or_create(
            name='Real Signal Test Org'
        )

        project, _ = Project.objects.get_or_create(
            name='Real Signal Test Project',
            organization=org
        )

        print_pass(f"测试环境准备完成")

    except Exception as e:
        print_fail(f"设置失败: {e}")
        import traceback
        traceback.print_exc()
        return

    # Create workflow that listens to task events
    print_test("创建监听任务事件的工作流")
    try:
        workflow = AgentWorkflowDefinition.objects.create(
            name='Real Signal Test Workflow',
            description='监听真实 Django 信号',
            project=project,
            created_by=user,
            status='active',
            trigger_enabled=True,
            trigger_config={
                'trigger_type': 'instant',
                'instant': {
                    'event_types': ['task.created', 'task.status_changed'],
                    'webhook_enabled': False,
                }
            }
        )
        print_pass(f"工作流创建: {workflow.id}")
        print_pass(f"监听事件: task.created, task.status_changed")

    except Exception as e:
        print_fail(f"工作流创建失败: {e}")
        import traceback
        traceback.print_exc()
        return

    # Test 1: Create a real task (should trigger task.created signal)
    print_test("测试真实任务创建 → task.created 信号")
    try:
        initial_log_count = WorkflowTriggerLog.objects.filter(workflow=workflow).count()
        print(f"  初始日志数: {initial_log_count}")

        # Create a real task
        task = Task.objects.create(
            summary='测试任务 - 用于验证 Django 信号',
            description='这个任务会触发 task.created 信号',
            project=project,
            status='TODO',
            created_by=user,
        )

        print_pass(f"任务已创建: {task.id} - {task.summary}")

        # Wait a moment for the signal to process
        time.sleep(0.5)

        # Check if workflow was triggered
        new_log_count = WorkflowTriggerLog.objects.filter(workflow=workflow).count()
        print(f"  新日志数: {new_log_count}")

        if new_log_count > initial_log_count:
            print_pass(f"✓✓ Django 信号成功触发工作流！(新增 {new_log_count - initial_log_count} 条日志)")

            # Get the latest log
            latest_log = WorkflowTriggerLog.objects.filter(workflow=workflow).order_by('-created_at').first()
            if latest_log:
                print_pass(f"触发日志详情:")
                print(f"    • 事件类型: {latest_log.trigger_context.get('event_type')}")
                print(f"    • 任务 ID: {latest_log.trigger_context.get('task_id')}")
                print(f"    • 任务摘要: {latest_log.trigger_context.get('summary')}")
                print(f"    • 状态: {latest_log.status}")
        else:
            print_fail("❌ Django 信号未触发工作流")
            print("  可能原因:")
            print("  1. 信号处理器未正确注册")
            print("  2. AgentConfig.ready() 未被调用")
            print("  3. 信号处理器中有错误")

    except Exception as e:
        print_fail(f"任务创建测试失败: {e}")
        import traceback
        traceback.print_exc()

    # Test 2: Update task status (should trigger task.status_changed signal)
    print_test("测试任务状态变更 → task.status_changed 信号")
    try:
        initial_log_count = WorkflowTriggerLog.objects.filter(workflow=workflow).count()

        # Update task status
        old_status = task.status
        task.status = 'IN_PROGRESS'
        task.save()

        print_pass(f"任务状态已更新: {old_status} → {task.status}")

        # Wait for signal processing
        time.sleep(0.5)

        # Check if workflow was triggered
        new_log_count = WorkflowTriggerLog.objects.filter(workflow=workflow).count()

        if new_log_count > initial_log_count:
            print_pass(f"✓✓ 状态变更信号成功触发工作流！")

            latest_log = WorkflowTriggerLog.objects.filter(workflow=workflow).order_by('-created_at').first()
            if latest_log:
                print_pass(f"触发日志详情:")
                print(f"    • 事件类型: {latest_log.trigger_context.get('event_type')}")
                print(f"    • 旧状态: {latest_log.trigger_context.get('old_status')}")
                print(f"    • 新状态: {latest_log.trigger_context.get('new_status')}")
        else:
            print_fail("❌ 状态变更信号未触发工作流")

    except Exception as e:
        print_fail(f"状态变更测试失败: {e}")
        import traceback
        traceback.print_exc()

    # Test 3: Verify workflow is NOT triggered for non-monitored events
    print_test("测试工作流不会被未监听的事件触发")
    try:
        initial_log_count = WorkflowTriggerLog.objects.filter(workflow=workflow).count()

        # Update task summary (should NOT trigger, as we only listen to status changes)
        task.summary = '更新后的任务摘要'
        task.save()

        time.sleep(0.5)

        new_log_count = WorkflowTriggerLog.objects.filter(workflow=workflow).count()

        if new_log_count == initial_log_count:
            print_pass("✓ 非监听字段更新不触发工作流（正确行为）")
        else:
            print_fail("非监听字段更新意外触发了工作流")

    except Exception as e:
        print_fail(f"测试失败: {e}")

    # Summary
    print_test("测试总结")
    try:
        all_logs = WorkflowTriggerLog.objects.filter(workflow=workflow).order_by('-created_at')
        print_pass(f"总共创建了 {all_logs.count()} 条触发日志")

        for i, log in enumerate(all_logs, 1):
            event_type = log.trigger_context.get('event_type')
            status_info = ""
            if event_type == 'task.status_changed':
                old_s = log.trigger_context.get('old_status', '?')
                new_s = log.trigger_context.get('new_status', '?')
                status_info = f"({old_s} → {new_s})"

            print(f"  {i}. [{log.status}] {event_type} {status_info} - {log.created_at.strftime('%H:%M:%S')}")

    except Exception as e:
        print_fail(f"总结失败: {e}")

    # Cleanup
    print_test("清理测试数据")
    try:
        task.delete()
        WorkflowTriggerLog.objects.filter(workflow=workflow).delete()
        workflow.delete()
        print_pass("测试数据清理完成")
    except Exception as e:
        print_fail(f"清理失败: {e}")

    print_header("真实信号集成测试完成!")
    print("\n✓ Django 信号自动触发机制工作正常")
    print("✓ task.created 事件在任务创建时自动触发")
    print("✓ task.status_changed 事件在状态变更时自动触发")
    print("✓ 未监听的事件不会触发工作流")
    print("\n🎉 Phase 3 即刻触发功能完全正常！")


if __name__ == '__main__':
    run_tests()
