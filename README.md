# molecularjs dns nameserver

To use this module requires both https://github.com/FLYBYME/config and https://github.com/FLYBYME/config-mixin
It also has basic account services required by https://github.com/icebob/kantab/blob/master/backend/services/accounts.service.js

I am taking pull request tips and advice.

Major item I would like to include is dnssec.


# Config
NS reocrds are populated from "ddns.domains.nameservers" when creating a new domain. 
When creating a new domain a SOA record is created with the "ddns.domains.hostmaster"

Your config should look like
```js
defaultConfig: {
    "ddns.domains.domain": "example.com",
    "ddns.domains.hostmaster": "hostmaster.example.com",
    "ddns.domains.nameservers": [
        "orion.example.com",
        "hades.example.com",
        "zeus.example.com"
    ],
}
```

# Sync all agent records
Maybe sometimes records become out of sync. This might happen when an agent missed the broadcast for remove and create record event.
```
call v1.domains.sync
```

# agent
The agent should run on every server you want to be a resolver services/ddns.agent.js You can have as many nameservers as you want.

## Bind nameserver to agent IP
By defualt agent only binds to 127.0.0.1 and ::1
It can resolve to both IPv6 and IPv4

If proxy=true the agent will call v1.dohs.query and will become a recursive resolver. This is so the agent can become a local network resolver.
On a public IP this maybe dangerous idea but its your choice.
```
dcall agent-name v1.ddns.bind --address=10.0.0.1 --proxy=true
dcall agent-name v1.ddns.bind --address=123.123.123.124 --proxy=false
dcall agent-name v1.ddns.bind --address=2001:0db8:85a3:0000:0000:8a2e:0370:7334 --proxy=false
```

# Domains
## Create
To create a new domain
```
call v1.domains.create --#userID=GMk6dpXx8nS4WeNW3XZB --domain=example.com --name=example
```
### result
```js
  {
    id: "qxpJdmrOBpH15jaQP00P",
    default: false,
    domain: "example.com",
    name: "example",
    tld: "com",
    sld: "example",
    owner: "GMk6dpXx8nS4WeNW3XZB",
    members: [ "GMk6dpXx8nS4WeNW3XZB" ],
    public: false,
    archived: false,
    createdAt: 1649100422929
  }
```
## Find domains
```
call v1.domains.find  --#userID=GMk6dpXx8nS4WeNW3XZB
```
### result
```js
 [ 
     {
        id: "qxpJdmrOBpH15jaQP00P",
        default: false,
        domain: "example.com",
        name: "example",
        tld: "com",
        sld: "example",
        owner: "GMk6dpXx8nS4WeNW3XZB",
        members: [ "GMk6dpXx8nS4WeNW3XZB" ],
        public: false,
        archived: false,
        createdAt: 1649100422929
    }
 ]
```
## Find domains
```
call v1.domains.resolve  --#userID=GMk6dpXx8nS4WeNW3XZB --id=qxpJdmrOBpH15jaQP00P
```
### result
```js
{
    id: "qxpJdmrOBpH15jaQP00P",
    default: false,
    domain: "example.com",
    name: "example",
    tld: "com",
    sld: "example",
    owner: "GMk6dpXx8nS4WeNW3XZB",
    members: [ "GMk6dpXx8nS4WeNW3XZB" ],
    public: false,
    archived: false,
    createdAt: 1649100422929
}
```

## Remove
To remove a domain and all its records
```
call v1.domains.remove --#userID=GMk6dpXx8nS4WeNW3XZB --id=qxpJdmrOBpH15jaQP00P
```
### result
```js
"BNkjPMLDy3HqGErJ4aaj"
```


# Records
## Create
To create a new record
```
call v1.domains.records.create --#userID=GMk6dpXx8nS4WeNW3XZB --domain=qxpJdmrOBpH15jaQP00P --fqdn=example.com --type=A --data=1.1.1.1
```
### result
```js
{
  id: 'BNkjPMLDy3HqGErJ4aaj',
  domain: 'qxpJdmrOBpH15jaQP00P',
  fqdn: 'example.com',
  type: 'A',
  data: '1.1.1.1',
  network: null,
  ttl: 99,
  priority: 5,
  flag: 0,
  nullified: false,
  poison: false,
  createdAt: 1651765954239
}
```
To create a new record that resolves to a subnet of 10.0.0.0/8
```
call v1.domains.records.create --#userID=GMk6dpXx8nS4WeNW3XZB --domain=qxpJdmrOBpH15jaQP00P --fqdn=example.com --type=A --data=10.0.0.1 --network=10.0.0.0/8
```
### result
```js
{
  id: 'YDkezoz8aPHnOrzDELLW',
  domain: 'qxpJdmrOBpH15jaQP00P',
  fqdn: 'example.com',
  type: 'A',
  data: '10.0.0.1',
  network: '10.0.0.0/8',
  ttl: 99,
  priority: 5,
  flag: 0,
  nullified: false,
  poison: false,
  createdAt: 1651765982890
}
```

## find
```
call v1.domains.records.find --#userID=GMk6dpXx8nS4WeNW3XZB --domain=qxpJdmrOBpH15jaQP00P
```
### result
```js
[
  {
    id: 'RzkYW0kdBwH0e99aQyZn',
    domain: 'qxpJdmrOBpH15jaQP00P',
    fqdn: 'example.com',
    type: 'SOA',
    data: 'example.com',
    network: null,
    ttl: 3600,
    priority: 5,
    flag: 0,
    admin: 'hostmaster.example.com',
    serial: 2003080800,
    refresh: 86400,
    retry: 900,
    expiration: 1209600,
    minimum: 86400,
    nullified: false,
    poison: false,
    createdAt: 1649100423810
  },
  {
    id: 'rxgGMXgj2ntvxzz297l3',
    domain: 'qxpJdmrOBpH15jaQP00P',
    fqdn: 'example.com',
    type: 'CAA',
    data: 'letsencrypt.org',
    network: null,
    ttl: 99,
    priority: 5,
    flag: 0,
    tag: 'issuewild',
    nullified: false,
    poison: false,
    createdAt: 1649100423938
  },
  {
    id: 'MRke6Y9LoLtoeNNYjDXe',
    domain: 'qxpJdmrOBpH15jaQP00P',
    fqdn: 'example.com',
    type: 'NS',
    data: 'orion.example.com',
    network: null,
    ttl: 99,
    priority: 5,
    flag: 0,
    nullified: false,
    poison: false,
    createdAt: 1649100424039
  },
  {
    id: '0qyRNQpLQ8TR6OyGqo4X',
    domain: 'qxpJdmrOBpH15jaQP00P',
    fqdn: 'example.com',
    type: 'NS',
    data: 'hades.example.com',
    network: null,
    ttl: 99,
    priority: 5,
    flag: 0,
    nullified: false,
    poison: false,
    createdAt: 1649100424303
  },
  {
    id: 'xxqWk2ojB9c3WR0jgyX5',
    domain: 'qxpJdmrOBpH15jaQP00P',
    fqdn: 'example.com',
    type: 'NS',
    data: 'zeus.example.com',
    network: null,
    ttl: 99,
    priority: 5,
    flag: 0,
    nullified: false,
    poison: false,
    createdAt: 1649102415777
  }
]
```

## Remove
To remove a record
```
call v1.domains.records.remove --#userID=GMk6dpXx8nS4WeNW3XZB --id=BNkjPMLDy3HqGErJ4aaj
```
### result
```js
"BNkjPMLDy3HqGErJ4aaj"
```
# DNS over https
By default dohs will cache querys for their ttl time
DoHs has 3 resolvers. google, cloudflare and cleanbrowsing
Adding the flag --provider=cleanbrowsing will use cleanbrowsing as the upsteam resolver default is cloudflare

```
call v1.dohs.query --fqdn=google.com --type=A --cache=false
```
# DNS resolver
The DNS resolver is like DoHs but just uses node UDP. It can be useful to run on every server and test for DNS propagation or if anycast DNS is been used.
```
call v1.domains.resolver.resolve --fqdn=google.com --type=A --provider=opendns
```
## Result
```js
[ '142.251.41.46' ]
```



### list of resolvers
```js
[
    { "name": "google", "ip": "8.8.8.8" },
    { "name": "quad", "ip": "9.9.9.9" },
    { "name": "opendns", "ip": "208.67.222.220" },
    { "name": "verizon_fios_business", "ip": "98.113.146.9" },
    { "name": "att_services", "ip": "12.121.117.201" },
    { "name": "corporate_west_computer_systems", "ip": "66.206.166.2" },
    { "name": "quad", "ip": "149.112.112.112" },
    { "name": "cogecodata", "ip": "66.199.45.225" },
    { "name": "ionica_llc", "ip": "176.103.130.130" },
    { "name": "liquid_telecommunications_ltd", "ip": "5.11.11.5" },
    { "name": "nforce_entertainment_bv", "ip": "185.107.80.84" },
    { "name": "association_gitoyen", "ip": "80.67.169.12" },
    { "name": "prioritytelecom_spain_sa", "ip": "212.230.255.1" },
    { "name": "oskar_emmenegger", "ip": "194.209.157.109" },
    { "name": "nemoxnet", "ip": "83.137.41.9" },
    { "name": "docklands_data_centre_ltd", "ip": "81.24.196.76" },
    { "name": "mentor_it_as", "ip": "176.62.205.201" },
    { "name": "deutsche_telekom_ag", "ip": "195.243.214.4" },
    { "name": "gestion_de_direccionamiento_uninet", "ip": "201.144.135.211" },
    { "name": "claro_sa", "ip": "200.248.178.54" },
    { "name": "ohana_communications_sdn_bhd", "ip": "103.26.250.4" },
    { "name": "cloudflare_inc", "ip": "1.1.1.1" },
    { "name": "pacific_internet", "ip": "61.8.0.113" },
    { "name": "iconz_ltd", "ip": "210.48.77.68" },
    { "name": "tefincom_sa", "ip": "103.86.99.100" },
    { "name": "lg_dacom_corporation", "ip": "164.124.101.2" },
    { "name": "shenzhen_sunrise_technology_co", "ip": "202.46.32.187" },
    { "name": "teknet_yazlim", "ip": "31.7.37.37" },
    { "name": "mahanagar_telephone_nigam_limited", "ip": "203.94.227.70" },
    { "name": "multinet_pakistan_pvt_ltd", "ip": "125.209.116.22" },
    { "name": "cloudity_network", "ip": "185.83.212.30" },
    { "name": "daniel_cid", "ip": "185.228.168.9" },
    { "name": "pabna_cable_vision", "ip": "103.153.154.2" }
]
```