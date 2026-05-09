from django.urls import path
from .views import ShortestPathView

urlpatterns = [
    path('shortest-path/', ShortestPathView.as_view(), name='shortest-path'),
]
