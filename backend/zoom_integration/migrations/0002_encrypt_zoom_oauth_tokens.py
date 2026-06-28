# Generated manually: encrypt Zoom OAuth tokens at rest.

from django.db import migrations, models


def encrypt_existing_tokens(apps, schema_editor):
    from zoom_integration.crypto import encrypt_token

    ZoomCredential = apps.get_model("zoom_integration", "ZoomCredential")
    for row in ZoomCredential.objects.all():
        row.encrypted_access_token = encrypt_token(row.access_token)
        row.encrypted_refresh_token = encrypt_token(row.refresh_token)
        row.save(
            update_fields=["encrypted_access_token", "encrypted_refresh_token"],
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("zoom_integration", "0001_initial"),
    ]

    operations = []
