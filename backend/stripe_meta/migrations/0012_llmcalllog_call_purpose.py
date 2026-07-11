from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('stripe_meta', '0011_stripewebhookevent_claimed_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='llmcalllog',
            name='call_purpose',
            field=models.CharField(
                choices=[
                    ('data_analysis', 'Data Analysis'),
                    ('column_detection', 'Column Detection'),
                    ('criteria_generation', 'Criteria Generation'),
                    ('miro_generation', 'Miro Generation'),
                    ('follow_up_chat', 'Follow-up Chat'),
                    ('calendar_suggestion', 'Calendar Suggestion'),
                    ('other', 'Other'),
                ],
                default='other',
                max_length=30,
                db_index=True,
            ),
        ),
    ]
