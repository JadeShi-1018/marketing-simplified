# Generated manually for CSM-S01-02 phase 1

import uuid

import csm.models
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
        ('experience_group', '0001_initial'),
        ('csm', '0010_add_image_to_conversationmessage'),
    ]

    operations = [
        migrations.CreateModel(
            name='SupportChannel',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('channel_type', models.CharField(
                    choices=[
                        ('live_chat', 'Live chat'),
                        ('contact_form', 'Contact form'),
                        ('email', 'Email'),
                    ],
                    max_length=20,
                )),
                ('display_name', models.CharField(max_length=200)),
                ('welcome_message', models.TextField(blank=True)),
                ('operating_hours', models.JSONField(default=csm.models.default_operating_hours)),
                ('timezone', models.CharField(default='UTC', max_length=64)),
                ('offline_fallback_message', models.TextField(blank=True)),
                ('offline_alternative', models.CharField(
                    choices=[
                        ('message_only', 'Message only'),
                        ('contact_form', 'Contact form'),
                        ('knowledge_base', 'Knowledge base'),
                    ],
                    default='message_only',
                    max_length=20,
                )),
                ('offline_alternative_target_id', models.PositiveIntegerField(blank=True, null=True)),
                ('email_address', models.EmailField(blank=True, max_length=254)),
                ('embed_key', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('default_queue', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='support_channels',
                    to='csm.queue',
                )),
                ('project', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='support_channels',
                    to='core.project',
                )),
                ('ticket_form', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='support_channels',
                    to='csm.ticketform',
                )),
            ],
            options={
                'ordering': ['sort_order', 'display_name'],
            },
        ),
        migrations.CreateModel(
            name='SupportChannelExperienceGroup',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('channel', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='experience_group_links',
                    to='csm.supportchannel',
                )),
                ('experience_group', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='support_channel_links',
                    to='experience_group.experiencegroup',
                )),
            ],
        ),
        migrations.AddField(
            model_name='conversation',
            name='support_channel',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='conversations',
                to='csm.supportchannel',
            ),
        ),
        migrations.AddIndex(
            model_name='supportchannel',
            index=models.Index(fields=['project', 'is_active'], name='csm_sc_proj_active_idx'),
        ),
        migrations.AddIndex(
            model_name='supportchannel',
            index=models.Index(fields=['embed_key'], name='csm_sc_embed_key_idx'),
        ),
        migrations.AddConstraint(
            model_name='supportchannelexperiencegroup',
            constraint=models.UniqueConstraint(
                fields=('channel', 'experience_group'),
                name='csm_sceg_unique_channel_eg',
            ),
        ),
    ]
