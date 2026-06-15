from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0016_agentworkflowtemplate_agentprojectworkflowbinding_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='agentworkflowstep',
            name='step_type',
            field=models.CharField(
                max_length=30,
                choices=[
                    ('analyze_data', 'Analyze Data'),
                    ('call_dify', 'Call LLM (Legacy)'),
                    ('call_llm', 'Call LLM'),
                    ('create_decision', 'Create Decision'),
                    ('create_tasks', 'Create Tasks'),
                    ('generate_miro_snapshot', 'Generate Miro Snapshot'),
                    ('create_miro_board', 'Create Miro Board'),
                    ('custom_api', 'Custom API'),
                    ('await_confirmation', 'Await Confirmation'),
                    ('detect_columns', 'Detect Columns'),
                    ('normalize_data', 'Normalize Data'),
                    ('generate_criteria', 'Generate Criteria'),
                    ('if_else', 'If - Else'),
                    ('merge', 'Merge'),
                    ('loop', 'Loop'),
                ],
            ),
        ),
    ]
