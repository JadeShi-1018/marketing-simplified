# Add font_family and font_size to SpreadsheetCellFormat for cell typography.
# Also creates SpreadsheetCellFormat table (replaces missing 0004) so this runs from 0001 only.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('spreadsheet', '0001_initial'),
    ]

    operations = []
