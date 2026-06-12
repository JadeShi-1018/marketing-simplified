import uuid
from django.db import models
from django.utils.text import slugify
from django.shortcuts import get_object_or_404

class SluggedResourceModelMixin(models.Model):
    """
    A mixin to add a unique `slug` field to a Django model.
    The slug is automatically generated on save from the source field (name, title, or summary).
    """
    slug = models.SlugField(max_length=255, unique=True, blank=True, db_index=True)

    class Meta:
        abstract = True
        
    def get_slug_source_value(self):
        """Determine which field to use for the slug."""
        if hasattr(self, 'slug_source_field') and self.slug_source_field:
            return getattr(self, self.slug_source_field, "")
        if hasattr(self, 'name'):
            return getattr(self, 'name', "")
        if hasattr(self, 'title'):
            return getattr(self, 'title', "")
        if hasattr(self, 'summary'):
            return getattr(self, 'summary', "")
        return ""

    def save(self, *args, **kwargs):
        if not self.slug:
            source_value = self.get_slug_source_value()
            
            base_slug = slugify(str(source_value))
            if not base_slug:
                base_slug = f"{self.__class__.__name__.lower()}-{str(uuid.uuid4())[:8]}"
            elif base_slug.isdigit():
                # Lookups are slug-only; a purely numeric slug (e.g. title "2024")
                # would be ambiguous with legacy numeric IDs, so prefix it.
                base_slug = f"{self.__class__.__name__.lower()}-{base_slug}"
                
            # Truncate base_slug if it's too long (leaving room for counter)
            base_slug = base_slug[:200]
                
            slug = base_slug
            counter = 1
            
            # Efficient uniqueness check loop
            while self.__class__.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
                
            self.slug = slug
            
        super().save(*args, **kwargs)


class SlugLookupViewSetMixin:
    """
    A viewset mixin that overrides get_object() to look up objects by `slug`
    (or by UUID primary key for models with UUID pks). Numeric identifiers
    are not resolved and yield 404.
    """
    def get_object(self):
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        lookup_value = str(self.kwargs[lookup_url_kwarg])
        queryset = self.filter_queryset(self.get_queryset())
        
        filter_kwargs = resolve_lookup_kwargs(lookup_value, self.lookup_field)
            
        obj = get_object_or_404(queryset, **filter_kwargs)
        self.check_object_permissions(self.request, obj)
        return obj

def resolve_lookup_kwargs(lookup_value, pk_field='pk', slug_field='slug'):
    """
    Helper function to generate filter kwargs for slug-only lookups.
    UUID values still resolve by primary key (for models with UUID pks,
    e.g. miro.Board); numeric IDs are NOT resolved and will 404.
    Pass slug_field to filter through a relation (e.g. 'workflow__slug').
    """
    lookup_value = str(lookup_value)
    try:
        uuid.UUID(lookup_value)
        return {pk_field: lookup_value}
    except ValueError:
        return {slug_field: lookup_value}
