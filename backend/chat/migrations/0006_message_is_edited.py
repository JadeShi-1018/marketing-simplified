from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0005_rename_chat_chatst_user_id_pos_idx_chat_chatst_user_id_7d6523_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='is_edited',
            field=models.BooleanField(default=False, help_text='True after content has been edited'),
        ),
    ]
