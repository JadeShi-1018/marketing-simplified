# Generated manually for CSM-S01-07 Phase 1

from django.conf import settings
from django.db import migrations, models
import csm.models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0001_initial'),
        ('experience_group', '0003_unique_name_per_project'),
        ('csm', '0005_csm_notification_and_is_creator'),
    ]

    operations = [
        migrations.CreateModel(
            name='SupportProject',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('name', models.CharField(max_length=200)),
                ('is_archived', models.BooleanField(default=False)),
                ('default_queue', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='default_for_support_projects', to='csm.queue')),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='support_projects', to='core.project')),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='CsmWorkType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('name', models.CharField(max_length=200)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='csm_work_types', to='core.project')),
            ],
            options={
                'ordering': ['sort_order', 'name'],
            },
        ),
        migrations.CreateModel(
            name='TicketForm',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('name', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('is_default', models.BooleanField(default=False)),
                ('is_active', models.BooleanField(default=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_ticket_forms', to=settings.AUTH_USER_MODEL)),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ticket_forms', to='core.project')),
            ],
            options={
                'ordering': ['-updated_at', 'name'],
            },
        ),
        migrations.CreateModel(
            name='TicketFormSubmission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('payload', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('experience_group', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='ticket_form_submissions', to='experience_group.experiencegroup')),
                ('form', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='submissions', to='csm.ticketform')),
                ('submitted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='ticket_form_submissions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='TicketFormField',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('field_key', models.SlugField(max_length=100)),
                ('label', models.CharField(max_length=200)),
                ('field_type', models.CharField(choices=[('system_summary', 'Summary'), ('system_description', 'Description'), ('system_project', 'Project'), ('system_work_type', 'Work Type'), ('text', 'Single-line text'), ('textarea', 'Multi-line text'), ('select', 'Single-select'), ('multiselect', 'Multi-select'), ('date', 'Date'), ('file', 'File attachment')], max_length=30)),
                ('is_required', models.BooleanField(default=False)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('options', models.JSONField(blank=True, default=list)),
                ('help_text', models.CharField(blank=True, max_length=500)),
                ('max_files', models.PositiveSmallIntegerField(default=10)),
                ('max_file_size_mb', models.PositiveSmallIntegerField(default=25)),
                ('form', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='fields', to='csm.ticketform')),
            ],
            options={
                'ordering': ['sort_order', 'id'],
            },
        ),
        migrations.CreateModel(
            name='TicketFormAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('experience_group', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='ticket_form_assignments', to='experience_group.experiencegroup')),
                ('form', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to='csm.ticketform')),
                ('support_project', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='ticket_form_assignments', to='csm.supportproject')),
            ],
        ),
        migrations.CreateModel(
            name='TicketAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(max_length=500, upload_to=csm.models.ticket_attachment_upload_to)),
                ('original_name', models.CharField(max_length=255)),
                ('size_bytes', models.PositiveIntegerField(default=0)),
                ('content_type', models.CharField(blank=True, max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('submission', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='csm.ticketformsubmission')),
                ('ticket', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='csm.ticket')),
            ],
        ),
        migrations.AddField(
            model_name='ticket',
            name='custom_field_values',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='ticket',
            name='experience_group',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='tickets', to='experience_group.experiencegroup'),
        ),
        migrations.AddField(
            model_name='ticket',
            name='form',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='tickets', to='csm.ticketform'),
        ),
        migrations.AddField(
            model_name='ticket',
            name='support_project',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='tickets', to='csm.supportproject'),
        ),
        migrations.AddField(
            model_name='ticket',
            name='work_type',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='tickets', to='csm.csmworktype'),
        ),
        migrations.AddConstraint(
            model_name='supportproject',
            constraint=models.UniqueConstraint(fields=('project', 'name'), name='csm_support_project_unique_name_per_project'),
        ),
        migrations.AddConstraint(
            model_name='csmworktype',
            constraint=models.UniqueConstraint(fields=('project', 'name'), name='csm_work_type_unique_name_per_project'),
        ),
        migrations.AddConstraint(
            model_name='ticketform',
            constraint=models.UniqueConstraint(condition=models.Q(('is_default', True)), fields=('project',), name='csm_unique_default_ticket_form_per_project'),
        ),
        migrations.AddIndex(
            model_name='ticketform',
            index=models.Index(fields=['project', 'is_default'], name='csm_tf_proj_default_idx'),
        ),
        migrations.AddConstraint(
            model_name='ticketformfield',
            constraint=models.UniqueConstraint(fields=('form', 'field_key'), name='csm_ticketformfield_unique_key_per_form'),
        ),
        migrations.AddIndex(
            model_name='ticketformfield',
            index=models.Index(fields=['form', 'sort_order'], name='csm_tff_form_order_idx'),
        ),
        migrations.AddConstraint(
            model_name='ticketformassignment',
            constraint=models.UniqueConstraint(condition=models.Q(('experience_group__isnull', False)), fields=('experience_group',), name='csm_ticketformassignment_unique_per_eg'),
        ),
        migrations.AddConstraint(
            model_name='ticketformassignment',
            constraint=models.UniqueConstraint(condition=models.Q(('support_project__isnull', False)), fields=('support_project',), name='csm_ticketformassignment_unique_per_support_project'),
        ),
        migrations.AddConstraint(
            model_name='ticketformassignment',
            constraint=models.CheckConstraint(check=models.Q(('experience_group__isnull', False), ('support_project__isnull', False), _connector='OR'), name='csm_ticketformassignment_requires_target'),
        ),
        migrations.AddConstraint(
            model_name='ticketattachment',
            constraint=models.CheckConstraint(check=models.Q(('ticket__isnull', False), ('submission__isnull', False), _connector='OR'), name='csm_ticketattachment_requires_parent'),
        ),
    ]
