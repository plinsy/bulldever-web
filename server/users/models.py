from django.db import models
from django.contrib.auth.models import User


class UserProfile(models.Model):
    ROLE_USAGER = 'usager'
    ROLE_POMPIER = 'pompier'
    ROLE_URGENCE = 'urgence'
    ROLE_AGENT = 'agent'

    ROLE_CHOICES = [
        (ROLE_USAGER, 'Usager'),
        (ROLE_POMPIER, 'Pompier'),
        (ROLE_URGENCE, 'Urgences'),
        (ROLE_AGENT, 'Agent de circulation'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_USAGER)

    class Meta:
        verbose_name = 'Profil utilisateur'
        verbose_name_plural = 'Profils utilisateurs'

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()})"
