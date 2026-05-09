from django.urls import path
from .views import TrafficDataView, POIView, PathfindingView, ChatbotView

urlpatterns = [
    path('traffic-data/', TrafficDataView.as_view(), name='traffic-data'),
    path('pois/', POIView.as_view(), name='pois'),
    path('pathfind/', PathfindingView.as_view(), name='pathfind'),
    path('chatbot/', ChatbotView.as_view(), name='chatbot'),
]
