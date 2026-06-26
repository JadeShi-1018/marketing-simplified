# Add frozen_row_count and frozen_column_count to Sheet for freeze header/panes.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('spreadsheet', '0006_spreadsheetcellformat_number_format'),
    ]

    operations = []
