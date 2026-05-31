# Generated manually

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('chat', '0007_add_message_reaction'),
    ]

    operations = [
        migrations.CreateModel(
            name='MessageReminder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('remind_at', models.DateTimeField(help_text='When to send the reminder notification')),
                ('note', models.CharField(blank=True, default='', help_text='Optional note for the reminder', max_length=255)),
                ('is_sent', models.BooleanField(default=False, help_text='Whether the reminder notification has been sent')),
                ('sent_at', models.DateTimeField(blank=True, help_text='When the reminder notification was sent', null=True)),
                ('message', models.ForeignKey(help_text='The message to be reminded about', on_delete=django.db.models.deletion.CASCADE, related_name='reminders', to='chat.message')),
                ('user', models.ForeignKey(help_text='User who set the reminder', on_delete=django.db.models.deletion.CASCADE, related_name='message_reminders', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['remind_at'],
            },
        ),
        migrations.AddIndex(
            model_name='messagereminder',
            index=models.Index(fields=['is_sent', 'remind_at'], name='chat_messag_is_sent_idx'),
        ),
        migrations.AddIndex(
            model_name='messagereminder',
            index=models.Index(fields=['user', 'is_sent'], name='chat_messag_user_id_idx'),
        ),
        migrations.AddIndex(
            model_name='messagereminder',
            index=models.Index(fields=['message', 'user'], name='chat_messag_message_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='messagereminder',
            unique_together={('message', 'user')},
        ),
    ]
