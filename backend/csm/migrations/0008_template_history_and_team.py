from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_project_organization_nullable'),
        ('csm', '0007_add_quick_reply_template'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Add team FK to QuickReplyTemplate
        migrations.AddField(
            model_name='quickreplytemplate',
            name='team',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='quick_reply_templates',
                to='core.team',
                help_text='If set, only members of this team can see the template',
            ),
        ),
        # Create QuickReplyTemplateHistory
        migrations.CreateModel(
            name='QuickReplyTemplateHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('edited_at', models.DateTimeField(auto_now_add=True)),
                ('title', models.CharField(max_length=200)),
                ('content', models.TextField()),
                ('rich_body', models.JSONField(blank=True, null=True)),
                ('tags', models.JSONField(default=list)),
                ('edited_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='template_edits',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('template', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='history',
                    to='csm.quickreplytemplate',
                )),
            ],
            options={
                'ordering': ['-edited_at'],
            },
        ),
    ]
