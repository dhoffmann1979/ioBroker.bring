/**
 * Bring! adapter
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

const utils = require('@iobroker/adapter-core');
const crypto = require(__dirname + '/lib/crypto');
const Bring = require(__dirname + '/lib/bring');
let adapter;

let mail;
let password;
let bring;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
        name: 'bring'
    });

    adapter = new utils.Adapter(options);

    adapter.on('unload', callback => {
        try {
            adapter.log.info('[END] Stopping Bring! adapter...');
            adapter.setState('info.connection', false, true);
            callback();
        } catch (e) {
            callback();
        } // endTryCatch
    });

    adapter.on('ready', () => {
        adapter.getForeignObjectAsync('system.config').then(obj => {
            if (obj && obj.native && obj.native.secret) {
                password = crypto.decrypt(obj.native.secret, adapter.config.password);
                mail = crypto.decrypt(obj.native.secret, adapter.config.mail);
            } else {
                password = crypto.decrypt('Zgfr56gFe87jJOM', adapter.config.password);
                mail = crypto.decrypt('Zgfr56gFe87jJOM', adapter.config.mail);
            } // endElse
            main();
        });
    });

    adapter.on('stateChange', async (id, state) => {
        if (!id || !state || state.ack) return;
        adapter.log.warn(`[STATE] Changed ${id} to ${state.val}`);
        const listId = id.split('.')[2];
        const method = id.split('.').pop();

        if (method === 'search') {
            const res = await bring.searchItem(state.val, listId);
            adapter.log.warn(`[SEARCH] Received ${JSON.stringify(res)}`);
            adapter.setState(id, state.val, true);
        } else if (method === 'removeItem') {
            const res = await bring.removeItem(listId, state.val);
            adapter.log.warn(`[REMOVE] Received ${JSON.stringify(res)}`);
        }
    });

    return adapter;
} // endStartAdapter


async function main() {
    adapter.subscribeStates('*');

    bring = new Bring({
        logger: adapter.log,
        mail: mail,
        password: password
    });

    await tryLogin();

    adapter.setState('info.user', bring.name, true);

    const bringLists = await bring.loadLists();

    adapter.log.warn(`[DATA] Lists loaded: ${JSON.stringify(bringLists)}`);

    for (const entry of bringLists.lists) {
        const promises = [];

        promises.push(adapter.setObjectNotExistsAsync(entry.listUuid, {
            type: 'channel',
            common: {
                name: entry.name
            },
            native: {}
        }));

        promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.content`, {
            type: 'state',
            common: {
                role: 'list.json',
                name: 'Content',
                desc: `Content of ${entry.name}`,
                read: true,
                write: false,
                type: 'string',
                def: '[]'
            },
            native: {}
        }));

        promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.recentContent`, {
            type: 'state',
            common: {
                role: 'list.json',
                name: 'Recent Content',
                desc: `Recent Content of ${entry.name}`,
                read: true,
                write: false,
                type: 'string',
                def: '[]'
            },
            native: {}
        }));

        promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.users`, {
            type: 'state',
            common: {
                role: 'list.json',
                name: 'Recent Content',
                desc: `Recent Content of ${entry.name}`,
                read: true,
                write: false,
                type: 'string',
                def: '[]'
            },
            native: {}
        }));

        promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.search`, {
            type: 'state',
            common: {
                role: 'text',
                name: 'Search',
                desc: 'Search for an item',
                read: true,
                write: true,
                type: 'string',
                def: ''
            },
            native: {}
        }));

        promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.searchResult`, {
            type: 'state',
            common: {
                role: 'text',
                name: 'Search Result',
                desc: 'Result of Search',
                read: true,
                write: false,
                type: 'string',
                def: ''
            },
            native: {}
        }));

        promises.push(adapter.setObjectNotExistsAsync(`${entry.listUuid}.removeItem`, {
            type: 'state',
            common: {
                role: 'text',
                name: 'Remove Item',
                desc: 'Remove item from List',
                read: true,
                write: true,
                type: 'string',
                def: ''
            },
            native: {}
        }));

        await Promise.all(promises);

        bring.getItems(entry.listUuid).then(data => {
            adapter.log.warn(`[DATA] Items from ${entry.listUuid} loaded: ${JSON.stringify(data)}`);
            adapter.setState(`${entry.listUuid}.content`, JSON.stringify(data.purchase), true);
            adapter.setState(`${entry.listUuid}.recentContent`, JSON.stringify(data.recently), true);
        }).catch(e => {
            adapter.log.warn(e);
        });

        bring.getAllUsersFromList(entry.listUuid).then(data => {
            adapter.log.warn(`[DATA] Users from ${entry.listUuid} loaded: ${JSON.stringify(data)}`);
            adapter.setState(`${entry.listUuid}.users`, JSON.stringify(data.users), true);
        }).catch(e => {
            adapter.log.warn(e);
        });
    } // endFor
} // endMain

async function tryLogin() {
    try {
        await bring.login();
        adapter.setState('info.connection', true, true);
        return Promise.resolve();
    } catch (e) {
        adapter.log.warn(e);
        adapter.log.info('[LOGIN] Reconnection in 30 seconds');
        setTimeout(tryLogin, 30000);
    } // endCatch
} // endTryLogin

if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
} // endElse