// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const Q = require('q');
const express = require('express');
const Genie = require('genie-toolkit');

const user = require('../util/user');
const platform = require('../service/platform');

const Config = require('../config');

const router = express.Router();

function config(req, res, next, userData, cloudData) {
    return Genie.IpAddressUtils.getServerName().then((host) => {
        var port = res.app.get('port');
        var serverAddress = 'http://' +
            (host.indexOf(':') >= 0 ? '[' + host + ']' : host)
            + ':' + port + Config.BASE_URL + '/config';

        var prefs = platform.getSharedPreferences();
        var cloudId = prefs.get('cloud-id');
        var authToken = prefs.get('auth-token');

        var qrcodeTarget = 'https://thingengine.stanford.edu/qrcode/' + host + '/'
            + port + '/' + authToken;

        var ipAddresses = Genie.IpAddressUtils.getServerAddresses(host);
        res.render('config', {
            page_title: "Configure Almond",
            csrfToken: req.csrfToken(),
            server: {
                name: host, port: port,
                address: serverAddress,
                extraAddresses: ipAddresses,
                initialSetup: authToken === undefined
            },
            user: {
                isConfigured: user.isConfigured(),
                username: userData.username || req.user,
                password: userData.password,
                error: userData.error
            },
            cloud: {
                isConfigured: cloudId !== undefined,
                error: cloudData.error,
                username: cloudData.username,
                id: cloudId
            },
            settings: {
                data_collection: prefs.get('sabrina-store-log') === 'yes'
            },
            qrcodeTarget: qrcodeTarget
        });
    });
}

router.get('/', user.redirectLogIn, (req, res, next) => {
    config(req, res, next, {}, {}).catch(next);
});

router.post('/set-options', user.requireLogIn, (req, res, next) => {
    const prefs = platform.getSharedPreferences();
    prefs.set('sabrina-store-log', req.body.data_collection ? 'yes' : 'no');
    res.redirect(303, Config.BASE_URL + '/config');
});

router.post('/set-server-password', user.requireLogIn, (req, res, next) => {
    var password;
    try {
        if (typeof req.body['password'] !== 'string' ||
            req.body['password'].length < 8 ||
            req.body['password'].length > 255)
            throw new Error("You must specify a valid password (of at least 8 characters)");

        if (req.body['confirm-password'] !== req.body['password'])
            throw new Error("The password and the confirmation do not match");
        password = req.body['password'];

    } catch(e) {
        config(req, res, next, { password: '',
                                 error: e.message }, {}).catch(next);
        return;
    }

    user.register(password).then((userObj) => {
        user.unlock(req, password);
        return Q.ninvoke(req, 'login', userObj);
    }).then(() => {
        res.redirect(Config.BASE_URL + '/config');
    }).catch((error) => {
        return config(req, res, next, { password: '',
                                        error: error.message }, {});
    }).catch(next);
});

module.exports = router;
