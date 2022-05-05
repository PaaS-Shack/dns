"use strict";

const C = require("../constants");


const DbService = require("db-mixin");
const Cron = require("cron-mixin");
const CacheCleaner = require("cache-cleaner-mixin");
const ConfigLoader = require("config-mixin");

const { MoleculerClientError } = require("moleculer").Errors;

/**
 * attachments of addons service
 */
module.exports = {
	name: "domains.records",
	version: 1,

	mixins: [
		DbService({
			cache: {
				additionalKeys: ["domain", "fqdn", "#userID"]
			}, collection: 'domains.records'
		}),
		CacheCleaner(["cache.clean.v1.domains"]),
		ConfigLoader(['ddns.domains.**'])
	],

	/**
	 * Service dependencies
	 */
	dependencies: [
		{ name: "domains", version: 1 }
	],

	/**
	 * Service settings
	 */
	settings: {
		rest: "/v1/domains/:domain/records",

		fields: {
			id: {
				type: "string",
				primaryKey: true,
				secure: true,
				columnName: "_id"
			},


			domain: {
				type: "string",
				empty: false,
				onCreate: ({ ctx, params }) => ctx.call("v1.domains.getDomain", { fqdn: params.fqdn, member: ctx.meta.userID }).then((domain) => domain.id),
				readonly: true,
				populate: {
					action: "v1.domains.get",
					params: {
						fields: ["id", "domain"]
					}
				},
				validate: "validateDomain",
			},

			fqdn: {
				type: "string",
				required: true,
				immutable: true,
				lowercase: true,
				trim: true,
				empty: false,
			},

			type: {
				type: "enum",
				values: ["A", "AAAA", "CNAME", "SOA", "MX", "NS", "TXT", "CAA"],
				immutable: true,
				required: true,
			},
			data: {
				type: "string",
				required: true,
			},
			network: {
				type: "string",
				default: null,
				trim: true,
				immutable: true,
				required: false,
			},
			replace: {
				type: "string",
				required: false,
			},

			ttl: {
				type: "number",
				default: 99,
				required: false,
			},
			priority: {
				type: "number",
				default: 5,
				required: false,
			},

			flag: {
				type: "number",
				default: 0,
				required: false,
			},
			tag: {
				type: "string",
				required: false,
			},

			admin: {
				type: "string",
				required: false,
			},
			serial: {
				type: "number",
				required: false,
			},
			refresh: {
				type: "number",
				required: false,
			},
			retry: {
				type: "number",
				required: false,
			},
			expiration: {
				type: "number",
				required: false,
			},
			minimum: {
				type: "number",
				required: false,
			},

			nullified: {
				type: "boolean",
				default: false,
				required: false,
			},
			poison: {
				type: "boolean",
				default: false,
				required: false,
			},


			options: { type: "object" },
			...C.TIMESTAMP_FIELDS
		},

		scopes: {
			// Return addons.attachments of a given addon where the logged in user is a member.

			async domain(query, ctx, params) { return this.validateHasDomainPermissions(query, ctx, params) },

			// attachment the not deleted addons.attachments
			notDeleted: { deletedAt: null }
		},

		defaultScopes: ["domain", "notDeleted"]
	},

	/**
	 * Actions
	 */

	actions: {
		create: {
			permissions: ['domains.records.create']
		},
		list: {
			permissions: ['domains.records.list'],
			permissionsTarget: 'domain',
			params: {
				domain: { type: "string" }
			}
		},

		find: {
			rest: "GET /find",
			permissions: ['domains.records.find'],
			params: {
				domain: { type: "string" }
			}
		},

		count: {
			rest: "GET /count",
			permissions: ['domains.records.count'],
			params: {
				domain: { type: "string" }
			}
		},

		get: {
			needEntity: true,
			permissions: ['domains.records.get']
		},

		update: {
			needEntity: true,
			permissions: ['domains.records.update']
		},

		replace: false,

		remove: {
			needEntity: true,
			permissions: ['domains.records.remove']
		},
		syncRecords: {
			params: {

			},
			async handler(ctx) {
				return this.findEntities(ctx, {});
			}
		}
	},

	/**
	 * Events
	 */
	events: {
		async "domains.created"(ctx) {
			const domain = ctx.params.data;
			console.log(this.config)
			const soa = {
				fqdn: domain.domain,
				type: "SOA",

				ttl: 3600,
				admin: this.config["ddns.domains.hostmaster"],
				serial: 2003080800,
				refresh: 86400,
				retry: 900,
				expiration: 1209600,
				minimum: 86400
			}

			soa.data = this.config["ddns.domains.domain"];

			await this.actions.create(soa, { parentCtx: ctx })

			await this.actions.create({
				fqdn: domain.domain,
				type: "CAA",
				flag: 0,
				tag: 'issuewild',
				data: 'letsencrypt.org'
			}, { parentCtx: ctx })

			const nameservers = this.config["ddns.domains.nameservers"]
			
			for (let index = 0; index < nameservers.length; index++) {
				const data = nameservers[index];
				await this.actions.create({
					fqdn: `${domain.domain}`,
					type: "NS",
					data,
				}, { parentCtx: ctx })
			}

		},
		async "domains.removed"(ctx) {
			const domain = ctx.params.data;
			try {
				const attachments = await this.findEntities(ctx, {
					query: { domain: domain.id },
					fields: ["id"],
					scope: false
				});
				await this.Promise.all(
					attachments.map(attachment => this.removeEntity(ctx, { id: attachment.id, scope: false }))
				);
			} catch (err) {
				this.logger.error(`Unable to delete attachments of domain '${domain.id}'`, err);
			}
		},
	},

	/**
	 * Methods
	 */
	methods: {
		async validateHasDomainPermissions(query, ctx, params) {
			// Adapter init
			if (!ctx) return query;

			if (params.domain) {
				const res = await ctx.call("v1.domains.getDomain", {
					id: params.domain, member: ctx.meta.userID
				});
				console.log({
					id: params.domain, owner: ctx.meta.userID
				}, res)

				if (res) {
					query.domain = params.domain;
					console.log(query)
					return query;
				}
				throw new MoleculerClientError(
					`You have no right for the domain '${params.domain}'`,
					403,
					"ERR_NO_PERMISSION",
					{ domain: params.domain }
				);
			}
			if (ctx.action.params.domain && !ctx.action.params.domain.optional) {
				throw new MoleculerClientError(`domain is required`, 422, "VALIDATION_ERROR", [
					{ type: "required", field: "domain" }
				]);
			}
		},

		async validateDomain({ ctx, value, params, id, entity }) {
			return ctx.call("v1.domains.getDomain", { fqdn: params.fqdn, member: ctx.meta.userID })
				.then((res) => res ? true : `No permissions '${value} not found'`)
		},
	},

	/**
	 * Service created lifecycle event handler
	 */
	created() { },

	/**
	 * Service started lifecycle event handler
	 */
	started() { },

	/**
	 * Service stopped lifecycle event handler
	 */
	stopped() { }
};
