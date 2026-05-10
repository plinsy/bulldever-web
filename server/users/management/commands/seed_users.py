from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from users.models import UserProfile

DEFAULT_USERS = [
    {
        'username': 'usager',
        'email': 'usager@tana.mg',
        'password': 'Usager2026!',
        'role': UserProfile.ROLE_USAGER,
        'first_name': 'Usager',
        'last_name': 'Test',
    },
    {
        'username': 'pompier',
        'email': 'pompier@tana.mg',
        'password': 'Pompier2026!',
        'role': UserProfile.ROLE_POMPIER,
        'first_name': 'Pompier',
        'last_name': 'Test',
    },
    {
        'username': 'urgence',
        'email': 'urgence@tana.mg',
        'password': 'Urgence2026!',
        'role': UserProfile.ROLE_URGENCE,
        'first_name': 'Urgence',
        'last_name': 'Test',
    },
    {
        'username': 'agent',
        'email': 'agent@tana.mg',
        'password': 'Agent2026!',
        'role': UserProfile.ROLE_AGENT,
        'first_name': 'Agent',
        'last_name': 'Circulation',
        'is_staff': True,
    },
]


class Command(BaseCommand):
    help = 'Crée les utilisateurs par défaut pour chaque rôle.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING('Création des utilisateurs par défaut…'))
        self.stdout.write('')

        for spec in DEFAULT_USERS:
            username = spec['username']
            is_staff = spec.get('is_staff', False)

            if User.objects.filter(username=username).exists():
                self.stdout.write(f'  {self.style.WARNING("EXISTE")}  {username}')
                continue

            user = User.objects.create_user(
                username=username,
                email=spec['email'],
                password=spec['password'],
                first_name=spec.get('first_name', ''),
                last_name=spec.get('last_name', ''),
                is_staff=is_staff,
            )
            UserProfile.objects.create(user=user, role=spec['role'])

            self.stdout.write(
                f'  {self.style.SUCCESS("CRÉÉ")}    {username:<12} '
                f'rôle={spec["role"]:<8}  '
                f'mdp={spec["password"]}'
            )

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Terminé.'))
        self.stdout.write(
            self.style.WARNING(
                'ATTENTION : changez ces mots de passe avant tout déploiement en production.'
            )
        )
