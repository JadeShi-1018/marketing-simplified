from django.db import models


class Customer(models.Model):
    email = models.EmailField()
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
    project = models.ForeignKey(                                                                                                                                  
      'core.Project',                                                                                                                                           
      on_delete=models.CASCADE,                                                                                                                                 
      related_name='customers',                                                                                                                                 
      null=True,                                                                                                                                                
      blank=True,
  )       
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    region = models.ForeignKey(
        'Region',
        null=True,
        blank = True,
        on_delete = models.SET_NULL,
        related_name='customers'

    )
    organisation = models.ForeignKey(
        'CustomerOrganisation', 
        null=True, 
        blank=True, 
        on_delete=models.SET_NULL, 
        related_name='customers'
        )    

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'email'],
                name='customer_unique_email_per_project',
            ),
        ]
    def __str__(self):
        return f"{self.full_name} <{self.email}>"
class Region(models.Model):
    name = models.CharField(max_length=200)
    project = models.ForeignKey('core.Project', on_delete=models.CASCADE, related_name='regions')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['project','name'],
                name = 'region_unique_name_per_project'
            )
        ]
class CustomerOrganisation(models.Model):
    name = models.CharField(max_length=200)
    domains = models.JSONField(default = list)
    industry = models.CharField(max_length = 200, blank = True, default = '')
    plan = models.CharField(max_length = 200, blank = True, default = '')
    region = models.ForeignKey(
        'Region',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='organisations'
    )
    project=models.ForeignKey(
        'core.Project',
        on_delete=models.CASCADE,
        related_name='customer_organisations'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['project','name'],
                name = 'customerorganisation_unique_name_per_project'
            )
        ]
    def __str__(self):
        return f"{self.name}"