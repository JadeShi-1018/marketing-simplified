# Bake config into the image so macOS Docker bind mounts do not trigger nginx
# "pread() returned only X bytes instead of Y" on VirtioFS.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
