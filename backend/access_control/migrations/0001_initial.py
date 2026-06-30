from django.db import migrations


class Migration(migrations.Migration):
    """
    Stub migration re-created after a merge lost the original file.
    access_control models live in per-org tenant schemas (provisioned by
    core.services.tenant.provision_tenant_schema), so no public-schema
    DDL is needed here.  This file exists solely to anchor the dependency
    chain that 0002_initial.py references.
    """

    initial = True

    dependencies = []

    operations = []
