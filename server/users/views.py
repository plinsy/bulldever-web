from datetime import datetime

from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from traffic.models import RoadSegment
from .models import UserProfile
from .serializers import RegisterSerializer, UserProfileSerializer


def _peak_factor(hour: int) -> float:
    if 7 <= hour <= 9 or 16 <= hour <= 19:
        return 0.6
    if 10 <= hour <= 15:
        return 0.3
    return 0.1


def _congestion_label(density: float) -> str:
    if density >= 0.8:
        return 'critique'
    if density >= 0.7:
        return 'fort'
    return 'modere'


class RegisterView(APIView):
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        profile = user.profile
        return Response({
            'token': token.key,
            'user': UserProfileSerializer(profile).data,
        }, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')

        if not username or not password:
            return Response(
                {'error': 'Identifiant et mot de passe requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response(
                {'error': 'Identifiants incorrects.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        token, _ = Token.objects.get_or_create(user=user)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': UserProfileSerializer(profile).data,
        })


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return Response(UserProfileSerializer(profile).data)


class BlockedRoadsView(APIView):
    """Returns road segments whose simulated density exceeds the given threshold."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        hour = int(request.query_params.get('hour', datetime.now().hour))
        threshold = float(request.query_params.get('threshold', 0.7))

        peak_factor = _peak_factor(hour)
        blocked = []
        for road in RoadSegment.objects.all():
            density = min(1.0, peak_factor + (abs(hash(road.id)) % 10) / 30.0)
            if density >= threshold:
                blocked.append({
                    'id': road.id,
                    'name': road.name or 'Route sans nom',
                    'geometry': road.geometry,
                    'density': round(density, 2),
                    'congestion_level': _congestion_label(density),
                })

        return Response({'count': len(blocked), 'roads': blocked})
