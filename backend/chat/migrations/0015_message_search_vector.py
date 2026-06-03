from django.db import migrations
import django.contrib.postgres.indexes
import django.contrib.postgres.search


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0014_add_thread_support'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='search_vector',
            field=django.contrib.postgres.search.SearchVectorField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name='message',
            index=django.contrib.postgres.indexes.GinIndex(
                fields=['search_vector'],
                name='chat_msg_search_vec_idx',
            ),
        ),
    ]
