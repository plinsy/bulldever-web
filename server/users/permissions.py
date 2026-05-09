from rest_framework.permissions import BasePermission


class HasRole(BasePermission):
    """Base permission — subclasses declare the required_roles tuple."""
    required_roles: tuple[str, ...] = ()

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        try:
            return request.user.profile.role in self.required_roles
        except AttributeError:
            return False


class IsUsager(HasRole):
    required_roles = ('usager',)


class IsPompier(HasRole):
    required_roles = ('pompier',)


class IsUrgence(HasRole):
    required_roles = ('urgence',)


class IsAgent(HasRole):
    required_roles = ('agent',)


class IsEmergencyRole(HasRole):
    """Pompier or urgence."""
    required_roles = ('pompier', 'urgence')


class IsAnyRole(HasRole):
    """Any authenticated user that has a valid role."""
    required_roles = ('usager', 'pompier', 'urgence', 'agent')
