# WebRadio
Simple NodeJS Web Radio Server streaming random files from an S3 Bucket

# NGINX Config

Info From [here](https://www.digitalocean.com/community/tutorials/how-to-serve-static-files-with-nginx-on-ubuntu-18-04)

Location `/etc/nginx/sites-available/default`:
Use Putty & rmate (VSCode `F1 > Start Server`) to connect and modify file
```shell
    server {
        listen 80 default_server;
        listen [::]:80 default_server;
    
        # SSL configuration
        #
        # listen 443 ssl default_server;
        # listen [::]:443 ssl default_server;
        #
    
        server_name chiptuneradio.com;
    
        location / {
            proxy_pass http://localhost:3000; #whatever port your app runs on
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
```

Server Restart:
```shell
sudo systemctl restart nginx
```

# SSL Cert Info

