'use strict';

const Promise = require('bluebird');
const express = require('express');
const winston = require('winston');
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const app = express();
const execAsync = Promise.promisify(exec);

const PORT = 8080;
const SUPER_SECRET_KEY = '';
const WORKING_DIR = '';
const COMMAND_SEQUENCES = [];
const LOG_COMMAND_OUTPUT = true;

const state = {
    isBusy: false,
    redeploy: false,
    deploy: null,
    queue: null,
    errors: [],
};

const deployApp = () => {
    if (state.isBusy) {
        winston.info('Worker is busy. Activate redeploy mode to redeploy new changes.');
        state.redeploy = true;
        return;
    }
    state.isBusy = true;
    state.deploy = state.queue;
    state.queue = null;

    winston.info('----------------------------------');
    winston.info('Webhook detected. Begin sync repo.');
    winston.info('----------------------------------');

    let commandPromise = Promise.resolve();
    COMMAND_SEQUENCES.forEach(command => {
        commandPromise = commandPromise
            .then(() => execAsync(command, { cwd: WORKING_DIR })
                .catch(err => {
                    winston.error(err);
                    state.errors.push(err);
                })
            )
            .then(output => {
                if (LOG_COMMAND_OUTPUT) {
                    winston.info('Execution result for ', command, ':');
                    winston.info(output);
                }
            });
    });

    commandPromise.done(() => {
        winston.info('--------------END SYNC---------------');
        state.isBusy = false;
        state.deploy = null;

        if (state.redeploy) {
            winston.info('Initiate redeploy');
            state.redeploy = false;
            deployApp();
        }
    });
};

app.use(bodyParser.json());
app.post('/updateMaster', (req, res) => {
    if (req.query.key === SUPER_SECRET_KEY) {
        res.sendStatus(200);
        state.queue = {
            user: `${req.body.actor.display_name} (${req.body.actor.username})`,
        };

        deployApp();
    } else {
        winston.info('Unauthorized Aceess Attempt Detected.');
        res.sendStatus(403);
    }
});

app.get('/', (req, res) => {
    if (req.query.key === SUPER_SECRET_KEY) {
        const stateCopy = Object.assign({}, state);
        if (!req.query.showError) stateCopy.errors = undefined;

        res.json(stateCopy);
    } else res.sendStatus(403);
});
app.listen(PORT, () => { winston.info('Autodeploy started at', PORT); });
