from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('traffic', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='TrafficSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('recorded_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('sim_hour', models.IntegerField()),
                ('total_cars', models.IntegerField()),
                ('stopped_cars', models.IntegerField()),
                ('cars_in_intersections', models.IntegerField()),
                ('avg_speed_kmh', models.FloatField()),
                ('zone_counts', models.JSONField(default=dict)),
                ('intersection_counts', models.JSONField(default=dict)),
            ],
            options={
                'ordering': ['-recorded_at'],
            },
        ),
    ]
