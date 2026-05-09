from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('traffic', '0002_trafficsnapshot'),
    ]

    operations = [
        migrations.CreateModel(
            name='Accident',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('scene_x', models.FloatField()),
                ('scene_z', models.FloatField()),
                ('bodily', models.BooleanField(default=False)),
                ('recorded_at', models.DateTimeField(auto_now_add=True, db_index=True)),
            ],
            options={
                'ordering': ['-recorded_at'],
            },
        ),
    ]
