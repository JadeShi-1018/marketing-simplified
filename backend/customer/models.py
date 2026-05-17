from django.db import models


class Customer(models.Model):
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=200)
    company = models.CharField(max_length=200, blank=True, default='')
    phone = models.CharField(max_length=50, blank=True, default='')
    experience_group = models.ForeignKey(
        'experience_group.ExperienceGroup',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='customers',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.full_name} <{self.email}>"
