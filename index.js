"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const inquirer_1 = __importStar(require("inquirer"));
const path_1 = require("path");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const https_1 = require("https");
const jsdom_1 = require("jsdom");
const chalk_1 = __importDefault(require("chalk"));
/// /// /// /// /// /// /// /// /// ///
inquirer_1.default.registerPrompt("fuzzypath", require("inquirer-fuzzy-path"));
/// /// /// /// /// /// /// /// /// ///
main();
function main() {
    (0, inquirer_1.prompt)([
        {
            type: "list",
            name: "type",
            message: "Where would you like to download audios from?",
            choices: [
                "Audio IDs",
                "Groups",
                "Users",
                "Library"
            ]
        },
        {
            type: "fuzzypath",
            itemType: "directory",
            suggestOnly: true,
            depthLimit: 5,
            name: "path",
            message: "Where would you like to save the audio?"
        }
    ]).then(async (ans) => {
        let useObj;
        if (ans.type === "Audio IDs") {
            useObj = { type: 4 };
        }
        else {
            const sans = await (0, inquirer_1.prompt)([
                { type: "number", name: "pages", message: "How many pages would you like to index? (0 or Negative for Infinity)" },
                { type: "number", name: "limit", message: "In each of these pages, how many results, maximum, should there be? (10/25/50/[100])" }
            ]);
            useObj = {
                type: 0,
                pages: isNaN(sans.pages) ? Infinity : sans.pages <= 0 ? Infinity : sans.pages,
                limit: isNaN(sans.limit) ? 100 : (sans.limit === 10 || sans.limit === 25 || sans.limit === 50 || sans.limit === 100) ? sans.limit : 100
            };
        }
        if (ans.type === "Library") {
            (0, inquirer_1.prompt)([{ type: "input", name: "query", message: "What would you like to search?" }]).then(pans => {
                useObj["type"] = 3;
                getLinks(pans.query, useObj, ans.path);
            }).catch(inquirerError);
        }
        else {
            switch (ans.type) {
                case "Groups":
                    useObj["type"] = 1;
                    break;
                case "Users":
                    useObj["type"] = 2;
                    break;
            }
            (0, inquirer_1.prompt)([{ type: "editor", name: "query", message: "Please enter a list of IDs to get audio from. Separate by whitespace." }]).then(pans => {
                const ids = pans.query.match(/\d+/g);
                if (ids && ids.length > 0) {
                    getLinks(ids, useObj, ans.path);
                }
                else {
                    console.error(chalk_1.default.red("No IDs were provided."));
                }
            }).catch(inquirerError);
        }
    }).catch(inquirerError);
}
/*
https://search.roblox.com/catalog/contents?CatalogContext=2&CreatorID=1&Keyword=Test123&SortAggregation=5&LegendExpanded=true&Category=9&PageNumber=2
https://search.roblox.com/catalog/json?CatalogContext=2&Category=9&SortType=3&ResultsPerPage=1000000
*/
// PC Detonator
async function getLinks(idOrQuery, data, pathPassthrough = __dirname) {
    let audioList = [];
    switch (data.type) {
        case 1: // Groups
            const ans = await (0, inquirer_1.prompt)([{ type: "confirm", name: "authorize", message: chalk_1.default.bgRed("WARNING! To get audio from groups, you will need to enter your .ROBLOSECURITY cookie. Do you understand?"), default: false }]).catch(inquirerError);
            if (ans && ans.authorize === true) {
                const pans = await (0, inquirer_1.prompt)([{ type: "editor", name: "token", message: "Enter your .ROBLOSECURITY cookie." }]).catch(inquirerError);
                if (pans && pans.token) {
                    const headers = { "Cookie": `.ROBLOSECURITY=${pans.token}`, "Content-Type": "application/json" };
                    const res = await get("https://users.roblox.com/v1/users/authenticated", { headers: headers, passRes: false }).catch((err) => {
                        console.error(chalk_1.default.red `Failed to authenticate.\n=> {white ${err}}`);
                        process.exit(1);
                    });
                    console.log(chalk_1.default.green `You have been authenticated as "{white ${res.content.name}}," or "{white ${res.content.displayName}}."`);
                    const user = await (0, inquirer_1.prompt)([{ type: "confirm", name: "confirm", message: `Do you want to use this account?` }]).catch(inquirerError);
                    if (user && user.confirm) {
                        // Begin getting group assets!
                        for (const id of idOrQuery) {
                            console.log(chalk_1.default.inverse(`Crawling group ID ${truncate(id, 13)}`));
                            const colID = await grpAstCrawl(id, headers).catch(console.error);
                            if (colID) {
                                audioList = [...new Set([...audioList, ...colID])];
                                console.log(chalk_1.default.green("Successful"));
                            }
                        }
                    }
                    else {
                        return main();
                    }
                }
                else {
                    console.error(chalk_1.default.red("No token entered/received"));
                    process.exit(1);
                }
            }
            break;
        case 2: // Users
            for (const id of idOrQuery) {
                console.log(chalk_1.default.inverse(`Crawling user ID ${truncate(id, 13)}`));
                const res = await get(`https://inventory.roblox.com/v1/users/${id}/can-view-inventory`).catch(ret => {
                    // Limit IDs up to 13 characters (Maximum ID no. of 1 Trillion)
                    console.error(chalk_1.default.red `Unable to get inventory from user ID {white ${truncate(id, 13)}}\n-> {white ${ret.error}}${ret.content.errors[0] ? chalk_1.default.red `\n-> {white ${ret.content.errors[0].message}}` : ""}`);
                });
                if (res) {
                    if (res.content && res.content.canView === true) {
                        const colID = await userInvCrawl(id).catch(console.error);
                        if (colID) {
                            audioList = [...new Set([...audioList, ...colID])];
                            console.log(chalk_1.default.green("Successful"));
                        }
                    }
                    else {
                        console.error(chalk_1.default.redBright `Unable to view the inventory at user ID {white ${truncate(id, 13)}}`);
                    }
                }
            }
            break;
        case 3: // Library
            audioList = {};
            const truncated = truncate(idOrQuery, 25), pans = await (0, inquirer_1.prompt)([{ type: "number", message: "Limit to what Creator ID? (0 for None)", name: "lid" }]), lcid = isNaN(pans.lid) ? 0 : Math.abs(pans.lid);
            for (let pn = 1; pn <= data.pages; pn++) {
                console.log(chalk_1.default.inverse(`Searching through library query ${truncated} - Page number ${pn}`));
                const res = await get(`https://search.roblox.com/catalog/json?Category=9&SortType=3&ResultsPerPage=${data.limit}&CreatorId=${lcid}&PageNumber=${pn}&Keyword=${idOrQuery}`).catch(ret => {
                    console.error(chalk_1.default.red `Unable to get library query {white ${truncated}}\n-> {white ${ret.error}}${ret.content.errors[0] ? chalk_1.default.red `\n-> {white ${ret.content.errors[0].message}}` : ""}`);
                });
                if (res && res.content.length > 0) {
                    for (const asset of res.content)
                        audioList[asset.AssetId] = { url: asset.AudioUrl, name: asset.Name };
                    console.log(chalk_1.default.green `Got {white ${res.content.length}} assets`);
                }
                else {
                    console.error(chalk_1.default.redBright `Library query {white ${truncated}} had no${pn > 1 ? " more" : ""} audio in contents`);
                }
            }
            break;
        case 4:
            audioList = idOrQuery;
    }
    download(audioList, pathPassthrough);
}
// // //
async function userInvCrawl(playerId, options = {}, page = 0, cursor) {
    return new Promise(async (resolve, reject) => {
        let list = [];
        const ares = await get(`https://inventory.roblox.com/v2/users/${playerId}/inventory/3?sortOrder=Desc&limit=100${cursor ? `&cursor=${cursor}` : ""}`).catch(ret => {
            // Limit IDs up to 13 characters (Maximum ID no. of 1 Trillion)
            reject(chalk_1.default.red `Failed to get inventory from user ID {white ${truncate(playerId, 13)}}\n-> {white ${ret.error}}${ret.content.errors[0] ? chalk_1.default.red `\n-> {white ${ret.content.errors[0].message}}` : ""}`);
        });
        if (ares && ares.content && ares.content.data && ares.content.data.length > 0) {
            ares.content.data.forEach((audio) => {
                list.push(audio.assetId);
            });
            if (ares.content.nextPageCursor) {
                list = [...new Set([...list, ...(await userInvCrawl(playerId, options, page + 1, ares.content.nextPageCursor))])];
            }
        }
        else {
            (cursor ? console.error : reject)(chalk_1.default.redBright `User ID {white ${truncate(playerId, 13)}} had no${cursor ? " more" : ""} audio in inventory`);
        }
        resolve(list);
    });
}
function grpAstCrawl(groupId, cheaders, options = {}, page = 0, cursor) {
    return new Promise(async (resolve, reject) => {
        let list = [];
        const ares = await get(`https://itemconfiguration.roblox.com/v1/creations/get-assets?assetType=3&groupId=${groupId}&limit=100${cursor ? `&cursor=${cursor}` : ""}`, { headers: cheaders }).catch(ret => {
            reject(chalk_1.default.red `Failed to get assets from group ID {white ${truncate(groupId, 13)}}\n-> {white ${ret.error}}${ret.content.errors[0] ? chalk_1.default.red `\n-> {white ${ret.content.errors[0].message}}` : ""}`);
        });
        if (ares && ares.content && ares.content.data && ares.content.data.length > 0) {
            ares.content.data.forEach((audio) => list.push(audio.assetId));
            if (ares.content.nextPageCursor) {
                list = [...new Set([...list, ...(await grpAstCrawl(groupId, cheaders, options, page + 1, ares.content.nextPageCursor))])];
            }
        }
        else {
            (cursor ? console.error : reject)(chalk_1.default.redBright `Group ID {white ${truncate(groupId, 13)}} had no${cursor ? " more" : ""} audio in contents`);
        }
        resolve(list);
    });
}
// // //
const mimeAudioTypes = { "mpeg": ".MP3", "ogg": ".OGG", "wav": ".WAV", "octet": "" };
// Not bandwidth safe
async function download(ids, path) {
    await (0, promises_1.mkdir)((0, path_1.resolve)(path, "binaries"), { recursive: true }).catch(err => {
        console.error(chalk_1.default.red `Failed to create audio directory!\n=> {white ${err}}`);
        process.exit(1);
    });
    if (Array.isArray(ids)) {
        if (ids.length > 0) {
            for (const id of ids)
                await dInv(id, path).then(printLine).catch(err => { console.error(err); });
            console.log(chalk_1.default.green("All done."));
            process.exit(0);
        }
    }
    else {
        const entries = Object.entries(ids);
        if (entries.length > 0) {
            for (const [id, data] of entries) {
                if (data.url) {
                    await dInv(data.url, path, data, id).then(printLine).catch(err => { console.error(err); });
                }
                else {
                    console.error(chalk_1.default.red `{white ${data.name}} ({white ${id}}) had no source URI. It has been skipped.`);
                }
            }
            console.log(chalk_1.default.green("All done."));
            process.exit(0);
        }
    }
    console.error(chalk_1.default.red("No IDs to download"));
    process.exit(1);
}
function dInv(id, path, data, dataId) {
    return new Promise(async (presolve, reject) => {
        let src = "", fname = "unset";
        if (data && data.name) {
            console.log(chalk_1.default.inverse(`Getting asset link ${id} (ID: ${dataId})`));
            fname = data.name.replace(/\\|\/|:|\*|\?|"|<|>|\|/g, "_");
            src = id.toString();
        }
        else {
            console.log(chalk_1.default.inverse(`Getting asset ID ${id}`));
            const response = await get(`https://www.roblox.com/library/${id}`, { followRedirects: true, headers: { "Content-Type": "text/html" } })
                .catch(err => reject(chalk_1.default.red `Failed to get site for ID {white ${truncate(id, 20)}}.\n-> {white ${err}}`));
            if (response) {
                const document = new jsdom_1.JSDOM(response.content).window.document, player = document.getElementsByClassName("MediaPlayerIcon icon-play")[0], title = document.getElementsByClassName("border-bottom item-name-container")[0];
                if (player) {
                    src = player.getAttribute("data-mediathumb-url");
                    fname = (title ? title.getElementsByTagName("h2")[0].innerHTML : (0, path_1.basename)(new URL(src).pathname)).replace(/\\|\/|:|\*|\?|"|<|>|\|/g, "_");
                }
                else {
                    reject(chalk_1.default.redBright `Unable to find the download link for asset ID {white ${id}}`);
                }
            }
        }
        const audioCont = await get(src, { passRes: true, headers: { "Accept": "audio/mpeg;q=1.0, audio/ogg;q=0.9, audio/wav;q=0.8, application/octet-stream", "Content-Disposition": "attachment" } })
            .catch(err => reject(chalk_1.default.red `Failed to audio data for ID {white ${truncate(id, 20)}}. ({white ${fname}})\n-> {white ${err}}`));
        if (audioCont) {
            const extension = audioCont.headers["content-type"].match(/(?!.*\/)([\w]*)/)[0], joined = fname + (mimeAudioTypes.hasOwnProperty(extension) ? mimeAudioTypes[extension] : extension);
            if (extension === "octet")
                console.log(chalk_1.default.redBright("Warning! - The following file sent back binary data; there may or may not be a file extension attached."));
            const qualPath = (0, path_1.resolve)(path, (extension === "octet" ? "binaries" : ""), joined), fHandle = (0, fs_1.createWriteStream)(qualPath), size = Number(audioCont.headers["content-length"]);
            let downloaded = 0;
            console.log(chalk_1.default.blueBright `Downloading {white ${joined}} from {white ${src}}.`);
            audioCont.on("data", (chunk) => {
                downloaded += chunk.length;
                printLine(chalk_1.default.blueBright `{white ${downloaded}} bytes downloaded ({white ${(downloaded / size * 100).toFixed(2)}%}) - {white ${size - downloaded}} bytes left - {white ${size}} bytes total`);
            }).on("end", () => {
                fHandle.close();
            });
            audioCont.pipe(fHandle).on("finish", () => {
                presolve(chalk_1.default.green("Downloaded.\n"));
            }).on("error", err => {
                fHandle.destroy();
                reject(chalk_1.default.red `Failed to write.\n-> {white ${err}}`);
            });
        }
    });
}
function inquirerError(err) {
    if (err.isTtyError) {
        console.error("Please run this program in a terminal.");
        process.exit(1);
    }
    else {
        throw new Error(err);
    }
}
function get(url, options = { headers: {}, followRedirects: true, passRes: false }) {
    return new Promise((resolve, reject) => {
        (0, https_1.request)(url, { headers: options?.headers })
            .setHeader("User-Agent", "GetData/1.0")
            .end().on("response", (response) => {
            if (options.passRes) {
                resolve(response);
            }
            else {
                let data = "";
                response.on("data", (chunk) => {
                    data += chunk.toString();
                }).on("end", () => {
                    if (response.statusCode && response.statusCode < 400) {
                        if (options.followRedirects && [301, 302, 303, 307, 308].includes(response.statusCode)) {
                            if (response.headers.location) {
                                get(response.headers.location, options).then(resolve).catch(reject);
                            }
                            else {
                                reject(`"${url}" gave me a redirection response, but not where to redirect to...`);
                            }
                        }
                        else {
                            if (response.headers["content-type"]?.includes("application/json")) {
                                try {
                                    resolve({ content: JSON.parse(data), headers: response.headers, statusCode: response.statusCode, statusMessage: response.statusMessage });
                                }
                                catch (e) {
                                    reject(e);
                                }
                            }
                            else {
                                resolve({ content: data, headers: response.headers, statusCode: response.statusCode, statusMessage: response.statusMessage });
                            }
                        }
                    }
                    else {
                        let retData;
                        if (response.headers["content-type"]?.includes("application/json")) {
                            try {
                                retData = JSON.parse(data);
                            }
                            catch (e) {
                                reject(e);
                            }
                        }
                        else {
                            retData = data;
                        }
                        reject({
                            error: `URL sent back${response.statusCode ? ` non-OK status code - ${response.statusCode}${response.statusMessage ? `: ${response.statusMessage}` : ""}` : " no status code"}`,
                            content: retData
                        });
                    }
                }).on("error", (err) => {
                    reject(err);
                });
            }
        });
    });
}
function printLine(text) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(text);
}
function truncate(text, length) {
    if (text.length > length) {
        return text.substring(0, length - 1) + "…";
    }
    else {
        return text;
    }
}
