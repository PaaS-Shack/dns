# molecularjs dns nameserver





#Sync all agent records
By defualt agent only binds to 127.0.0.1 and ::1
```
dcall agent-name v1.ddns.bind --address=10.0.0.1 --proxy=true
dcall agent-name v1.ddns.bind --address=123.123.123.124 --proxy=false
```


#DNS over https
By defaul dohs will cache querys for their ttl time
```
call v1.dohs.query --fqdn=google.com --type=A --cache=false
```