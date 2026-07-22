# Add pivot persistence: Sheet.kind and PivotConfig model

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('spreadsheet', '0007_sheet_frozen_row_count_frozen_column_count'),
    ]

    operations = []
