import { prompt } from "enquirer";
import { GSGroup, getGroups } from "./GetSocial";
import { MigrationContext, migrateGroup } from "./Migrator";
const { Select } = require('enquirer');
import * as cliProgress from 'cli-progress';
const winston = require('winston');

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.simple(),
  transports: [
    //
    // - Write all logs with importance level of `error` or less to `error.log`
    // - Write all logs with importance level of `info` or less to `combined.log`
    //
    new winston.transports.File({ filename: 'error.log', level: 'error', timestamp: true }),
    new winston.transports.File({ filename: 'output.log', level: 'debug', timestamp: true }),
  ],
});
async function run() {
    
    const { appId, apiKey, ascAdminToken, ascRegion, ascApiKey, authIdentity } : 
        {appId: string, apiKey: string, ascAdminToken: string, ascRegion: string, ascApiKey: string, authIdentity: string} = await prompt([
        {
            type: 'input',
            name: 'appId',
            message: 'Enter your GetSocial App ID',
        },
        {
            type: 'input',
            name: 'apiKey',
            message: 'Enter your GetSocial API Key',
        },
        {
            type: 'input',
            name: 'authIdentity',
            message: `Enter your GetSocial User's Authentication Identity (e.g. email) `,
        },
        {
            type: 'select',
            name: 'ascRegion',
            message: 'Enter your Amity Social Cloud Region',
            choices: ['us', 'eu', 'sg']
        },
        {
            type: 'input',
            name: 'ascApiKey',
            message: 'Enter your Amity Social Cloud API Key',
        },
        {
            type: 'input',
            name: 'ascAdminToken',
            message: 'Enter your Amity Social Cloud Admin Token',
        },
    ]);

    const multibar = new cliProgress.MultiBar({
        format: '{title}|{bar}| {percentage}% || {value}/{total} {unit}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);
    
    const migrationConfig : MigrationContext = {
        appId,
        apiKey,
        ascAdminToken,
        ascRegion,
        authIdentity,
        ascApiKey,
        multibar,
        logger
    }

    logger.debug('Retrieving groups...');
    const groups = await getGroups(migrationConfig);
    // console.log("Groups: ", groups);
    const groupPrompt = new Select({
      name: 'groupSelect',
      message: 'Pick a group to perform migration on',
      choices: groups.map(group => `${group.title.en} (${group.id})`)
    });
    const selectedGroupLabel = await groupPrompt.run();
    // capture groupId from the last part of string inside () and trim it)
    const arr = selectedGroupLabel.match(/\(([^)]+)\)/g);
    const selectedGroupId = arr[arr.length-1].slice(1, -1);
    const selectedGroup = groups.find(group => group.id === selectedGroupId) as GSGroup;
    logger.debug(`Migrating group: ${selectedGroup.id}\n`);
    await migrateGroup(migrationConfig, selectedGroup);
    multibar.stop();
}

run().catch((error) => {
    logger.error((error as Error).stack);
});

// migrateImage("https://i.natgeofe.com/n/4f5aaece-3300-41a4-b2a8-ed2708a0a27c/domestic-dog_thumb_16x9.jpg?w=1200", "a4c800603b5748570d526f5a2a03ecfd77ff3d70");