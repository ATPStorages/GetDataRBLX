import { IncomingHttpHeaders, IncomingMessage } from "http";
import { OutgoingHttpHeaders } from "http2";
import inquirer, { prompt } from "inquirer";
import { basename, resolve } from "path";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { request } from "https";
import { JSDOM } from "jsdom";
import chalk from "chalk";
/// /// /// /// /// /// /// /// /// ///
inquirer.registerPrompt("fuzzypath", require("inquirer-fuzzy-path"));
/// /// /// /// /// /// /// /// /// ///
main();
function main() {
    prompt([
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
    ]).then(async ans => {
        let useObj: { type: number, pages?: number, limit?: number };
        if(ans.type === "Audio IDs") {
            useObj = { type: 4 }
        } else {
            const sans = await prompt([
                { type: "number", name: "pages", message: "How many pages would you like to index? (0 or Negative for Infinity)" },
                { type: "number", name: "limit", message: "In each of these pages, how many results, maximum, should there be? (10/25/50/[100])" }
            ]);
            
            useObj = { 
                type: 0, 
                pages: isNaN(sans.pages) ? Infinity : sans.pages <= 0 ? Infinity : sans.pages, 
                limit: isNaN(sans.limit) ? 100 : (sans.limit === 10 || sans.limit === 25 || sans.limit === 50 || sans.limit === 100) ? sans.limit : 100 
            }
        }
        
        if(ans.type === "Library") {
            prompt([{ type: "input", name: "query", message: "What would you like to search?" }]).then(pans => {
                useObj["type"] = 3;
                getLinks(pans.query, useObj, ans.path);
            }).catch(inquirerError);
        } else {
            switch(ans.type) {
                case "Groups": useObj["type"] = 1; break;
                case "Users": useObj["type"] = 2; break;
            }
            
            prompt([{ type: "editor", name: "query", message: "Please enter a list of IDs to get audio from. Separate by whitespace." }]).then(pans => {
                const ids = pans.query.match(/\d+/g);
                if(ids && ids.length > 0) { getLinks(ids, useObj, ans.path); }
                else { console.error(chalk.red("No IDs were provided.")); }
            }).catch(inquirerError);
        }
    }).catch(inquirerError);
}
/*
https://search.roblox.com/catalog/contents?CatalogContext=2&CreatorID=1&Keyword=Test123&SortAggregation=5&LegendExpanded=true&Category=9&PageNumber=2
https://search.roblox.com/catalog/json?CatalogContext=2&Category=9&SortType=3&ResultsPerPage=1000000
*/

// PC Detonator
async function getLinks(idOrQuery: Array<string> | string, data: { type: number, pages?: number, limit?: number }, pathPassthrough: string=__dirname): Promise<void> {
    let audioList: Array<string> | any = [];

    switch(data.type) {
        case 1: // Groups
            const ans = await prompt([{ type: "confirm", name: "authorize", message: chalk.bgRed("WARNING! To get audio from groups, you will need to enter your .ROBLOSECURITY cookie. Do you understand?"), default: false }]).catch(inquirerError);
            if(ans && ans.authorize === true) {
                const pans = await prompt([{ type: "editor", name: "token", message: "Enter your .ROBLOSECURITY cookie." }]).catch(inquirerError);
                if(pans && pans.token) {
                    const headers = {"Cookie": `.ROBLOSECURITY=${pans.token}`, "Content-Type": "application/json"}
                    const res = await get("https://users.roblox.com/v1/users/authenticated", { headers: headers }).catch(err => {
                        console.error(chalk.red`Failed to authenticate.\n=> {white ${err.error ? `${err.error}` : `${err.name} // ${err.message}`}${err.content.errors[0] ? `\n=> ${err.content.errors[0].message}` : ""}}`);
                        process.exit(1);
                    });
                    
                    console.log(chalk.green`You have been authenticated as "{white ${res.content.name}}," or "{white ${res.content.displayName}}."`);
                    const user = await prompt([{ type: "confirm", name: "confirm", message: `Do you want to use this account?`}]).catch(inquirerError);
                    if(user && user.confirm) {
                        // Begin getting group assets!
                        for(const id of idOrQuery) {
                            console.log(chalk.inverse(`Crawling group ID ${truncate(id, 13)}`));
                            const colID = await grpAstCrawl(id, headers).catch(console.error);

                            if(colID) {
                                audioList = [...new Set([...audioList,...colID])];
                                console.log(chalk.green("Successful"));
                            }
                        }
                    } else {
                        return main();
                    }
                } else {
                    console.error(chalk.red("No token entered/received"));
                    process.exit(1);
                }
            }

            break;
        case 2: // Users
            let cookie = "";
            const tans = await prompt([{ type: "confirm", name: "authorize", message: chalk.bgRed("Would you like to authenticate using your .ROBLOSECURITY? (This is unsafe; only use it if your main account is privated)"), default: false }]).catch(inquirerError);
            if(tans && tans.authorize === true) {
                const pans = await prompt([{ type: "editor", name: "token", message: "Enter your .ROBLOSECURITY cookie." }]).catch(inquirerError);
                if(pans && pans.token) {
                    const res = await get("https://users.roblox.com/v1/users/authenticated", { headers: {"Cookie": ".ROBLOSECURITY="+cookie} }).catch(err => {
                        console.error(chalk.red`Failed to authenticate.\n\n-> {white ${err.error ? `${err.error}` : `${err.name} // ${err.message}`}${err.content.errors[0] ? `\n-> ${err.content.errors[0].message}` : ""}}`);
                    });

                    if(res) {
                        console.log(chalk.green`You have been authenticated as "{white ${res.content.name}}," or "{white ${res.content.displayName}}."`);
                        const user = await prompt([{ type: "confirm", name: "confirm", message: `Do you want to use this account?`}]).catch(inquirerError);
                        if(user && user.confirm) cookie = pans.token;
                    }
                } else {
                    console.error(chalk.red("No token entered/received"));
                }
            }

            for(const id of idOrQuery) {
                console.log(chalk.inverse(`Crawling user ID ${truncate(id, 13)}`));
                const res = await get(`https://inventory.roblox.com/v1/users/${id}/can-view-inventory`, { headers: {"Cookie": ".ROBLOSECURITY="+cookie} }).catch(ret => {
                    // Limit IDs up to 13 characters (Maximum ID no. of 1 Trillion)
                    console.error(chalk.red`Unable to get inventory from user ID {white ${truncate(id, 13)}}\n-> {white ${ret.error}${ret.content.errors[0] ? chalk.red`\n-> ${ret.content.errors[0].message}` : ""}}`);
                });

                if(res) {
                    if(res.content && res.content.canView === true) {
                        const colID = await userInvCrawl(id, { cookie: cookie }).catch(console.error);

                        if(colID) {
                            audioList = [...new Set([...audioList,...colID])];
                            console.log(chalk.green("Successful"));
                        }
                    } else {
                        console.error(chalk.redBright`Unable to view the inventory at user ID {white ${truncate(id, 13)}}`);
                    }
                }
            }
            
            break;
        case 3: // Library
            audioList = {};
            const truncated = truncate(idOrQuery, 25),
                  pans = await prompt([{ type: "number", message: "Limit to what Creator ID? (0 for None)", name: "lid" }]),
                  lcid = isNaN(pans.lid) ? 0 : Math.abs(pans.lid);

            for(let pn = 1; pn <= data.pages!; pn++) {
                console.log(chalk.inverse(`Searching through library query ${truncated} - Page number ${pn}`));
                const res = await get(`https://search.roblox.com/catalog/json?Category=9&SortType=3&ResultsPerPage=${data.limit}&CreatorId=${lcid}&PageNumber=${pn}&Keyword=${idOrQuery}`).catch(ret => {
                    console.error(chalk.red`Unable to get library query {white ${truncated}}\n-> {white ${ret.error}${ret.content.errors[0] ? chalk.red`\n-> ${ret.content.errors[0].message}` : ""}}`);
                  });
                
                if(res && res.content.length > 0) {
                    for(const asset of res.content) 
                        audioList[asset.AssetId] = {url: asset.AudioUrl, name: asset.Name};
                    console.log(chalk.green`Got {white ${res.content.length}} assets`);
                } else {
                    console.error(chalk.redBright`Library query {white ${truncated}} had no${pn > 1 ? " more" : ""} audio in contents`);
                }
            }
            break;
        case 4:
            audioList = idOrQuery;
    }

    download(audioList, pathPassthrough);
}

// // //
async function userInvCrawl(playerId: string | number, options: { checkAccess?: boolean, maxPages?: number | string, limit?: number | string, cookie?: string } = {}, page: number = 0, cursor?: string): Promise<(string)[]> {
    return new Promise(async(resolve, reject) => {
        let list: Array<string> = [];
        const ares = await get(`https://inventory.roblox.com/v2/users/${playerId}/inventory/3?sortOrder=Desc&limit=100${cursor ? `&cursor=${cursor}` : ""}`, { headers: {"Cookie": ".ROBLOSECURITY="+options.cookie} }).catch(ret => {
            // Limit IDs up to 13 characters (Maximum ID no. of 1 Trillion)
            reject(chalk.red`Failed to get inventory from user ID {white ${truncate(playerId, 13)}}\n-> {white ${ret.error}${ret.content.errors[0] ? chalk.red`\n-> ${ret.content.errors[0].message}` : ""}}`)
        });

        if(ares && ares.content && ares.content.data && ares.content.data.length > 0) {
            ares.content.data.forEach((audio: any) => {
                list.push(audio.assetId);
            });

            if(ares.content.nextPageCursor) {
                list = [...new Set([...list,...(await userInvCrawl(playerId, options, page+1, ares.content.nextPageCursor))])];
            }
        } else {
            (cursor ? console.error : reject)(chalk.redBright`User ID {white ${truncate(playerId, 13)}} had no${cursor ? " more" : ""} audio in inventory`);
        }

        resolve(list);
    });
}

function grpAstCrawl(groupId: string | number, cheaders: any, options: { checkAccess?: boolean, maxPages?: number | string, limit?: number | string } = {}, page: number = 0, cursor?: string): Promise<(string)[]> {
    return new Promise(async(resolve, reject) => {
        let list: Array<string> = [];
        const ares = await get(`https://itemconfiguration.roblox.com/v1/creations/get-assets?assetType=3&groupId=${groupId}&limit=100${cursor ? `&cursor=${cursor}` : ""}`, { headers: cheaders }).catch(ret => {
            reject(chalk.red`Failed to get assets from group ID {white ${truncate(groupId, 13)}}\n-> {white ${ret.error}${ret.content.errors[0] ? chalk.red`\n-> ${ret.content.errors[0].message}` : ""}}`)
        });

        if(ares && ares.content && ares.content.data && ares.content.data.length > 0) {
            ares.content.data.forEach((audio: any) => list.push(audio.assetId));

            if(ares.content.nextPageCursor) {
                list = [...new Set([...list,...(await grpAstCrawl(groupId, cheaders, options, page+1, ares.content.nextPageCursor))])];
            }
        } else {
            (cursor ? console.error : reject)(chalk.redBright`Group ID {white ${truncate(groupId, 13)}} had no${cursor ? " more" : ""} audio in contents`);
        }

        resolve(list);
    });
}
// // //
const mimeAudioTypes: any = { "mpeg": ".MP3", "ogg": ".OGG", "wav": ".WAV", "octet": "" };

// Not bandwidth safe
async function download(ids: Array<string> | any, path: string) {
    await mkdir(resolve(path, "binaries"), {recursive: true}).catch(err => {
        console.error(chalk.red`Failed to create audio directory!\n=> {white ${err.error ? `${err.error}` : `${err.name} // ${err.message}`}${err.content.errors[0] ? `\n=> ${err.content.errors[0].message}` : ""}}`);
        process.exit(1);
    });

    if(Array.isArray(ids)) {
        if(ids.length > 0) {
            for(const id of ids) await dInv(id, path).then(printLine).catch(err => { console.error(err); });
            console.log(chalk.green("All done."));
            process.exit(0);
        }
    } else {
        const entries = Object.entries(ids) as [string, any][];

        if(entries.length > 0) {
            for(const [id, data] of entries) {
                if(data.url) { await dInv(data.url, path, data, id).then(printLine).catch(err => { console.error(err); }); } 
                else { console.error(chalk.red`{white ${data.name}} ({white ${id}}) had no source URI. It has been skipped.`); }
            }

            console.log(chalk.green("All done."));
            process.exit(0);
        }
    }

    console.error(chalk.red("No IDs to download"));
    process.exit(1);
}

function dInv(id: string | number, path: string, data?: any, dataId?: string): Promise<string> {
    return new Promise<string>(async(presolve, reject) => {
        let src: string = "", fname: string = "unset";
        if(data && data.name) {
            console.log(chalk.inverse(`Getting asset link ${id} (ID: ${dataId})`));
            fname = data.name.replace(/\\|\/|:|\*|\?|"|<|>|\|/g,"_");
            src = id.toString();
        } else {
            console.log(chalk.inverse(`Getting asset ID ${id}`));
            const response = await get(`https://www.roblox.com/library/${id}`, { followRedirects: true, headers: {"Content-Type": "text/html"} })
                .catch(err => reject(chalk.red`Failed to get site for ID {white ${truncate(id, 20)}}.\n-> {white ${err.error ? `${err.error}` : `${err.name} // ${err.message}`}${err.content.errors[0] ? `\n-> ${err.content.errors[0].message}` : ""}}`));
            if(response) {
                const document = new JSDOM(response.content).window.document,
                    player = document.getElementsByClassName("MediaPlayerIcon icon-play")[0],
                    title = document.getElementsByClassName("border-bottom item-name-container")[0];
                if(player) {
                    src = player.getAttribute("data-mediathumb-url")!;
                    fname = (title ? title.getElementsByTagName("h2")[0].innerHTML : basename(new URL(src).pathname)).replace(/\\|\/|:|\*|\?|"|<|>|\|/g,"_");
                } else {
                    reject(chalk.redBright`Unable to find the download link for asset ID {white ${id}}`);
                }
            }
        }
        
        const audioCont = await get(src!, {passRes: true, headers: {"Accept": "audio/mpeg;q=1.0, audio/ogg;q=0.9, audio/wav;q=0.8, application/octet-stream", "Content-Disposition": "attachment"}})
            .catch(err => reject(chalk.red`Failed to audio data for ID {white ${truncate(id, 20)}}. ({white ${fname}})\n-> {white ${err.error ? `${err.error}` : `${err.name} // ${err.message}`}${err.content.errors[0] ? `\n-> ${err.content.errors[0].message}` : ""}}`));
            
            if(audioCont) {
                const extension = audioCont.headers["content-type"]!.match(/(?!.*\/)([\w]*)/)![0], joined = fname + (mimeAudioTypes.hasOwnProperty(extension) ? mimeAudioTypes[extension]! : extension);
                if(extension === "octet") console.log(chalk.redBright("Warning! - The following file sent back binary data; there may or may not be a file extension attached."));
                const qualPath = resolve(path, (extension === "octet" ? "binaries" : ""), joined),
                    fHandle  = createWriteStream(qualPath),
                    size = Number(audioCont.headers["content-length"]);
                let downloaded = 0;
                console.log(chalk.blueBright`Downloading {white ${joined}} from {white ${src!}}.`);

                audioCont.on("data", (chunk) => {
                    downloaded += chunk.length;
                    printLine(chalk.blueBright`{white ${downloaded}} bytes downloaded ({white ${(downloaded/size * 100).toFixed(2)}%}) - {white ${size - downloaded}} bytes left - {white ${size}} bytes total`);
                }).on("end", () => {
                    fHandle.close();
                });

                audioCont.pipe(fHandle).on("finish", () => {
                    presolve(chalk.green("Downloaded.\n"));
                }).on("error", err => {
                    fHandle.destroy();
                    reject(chalk.red`Failed to write.\n-> {white ${err.name} // ${err.message}}`);
                });
            }
    });
}

function inquirerError(err: any) {
    if(err.isTtyError) { console.error("Please run this program in a terminal."); process.exit(1); }
    else { throw new Error(err); }
}

function get(
    url: string, 
    options: { headers?: OutgoingHttpHeaders, followRedirects?: boolean, passRes: true }
): Promise<IncomingMessage>

function get(
    url: string, 
    options?: { headers?: OutgoingHttpHeaders, followRedirects?: boolean, passRes?: false }
): Promise<{ content: string | any, headers: IncomingHttpHeaders, statusCode?: number, statusMessage?: string }>

function get(
        url: string, 
        options: { headers?: OutgoingHttpHeaders, followRedirects?: boolean, passRes?: any & boolean } = { headers: {}, followRedirects: true, passRes: false }
    ): Promise<{ content: string | any, headers: IncomingHttpHeaders, statusCode?: number, statusMessage?: string } | IncomingMessage> 
{
    return new Promise((resolve, reject) => {
        request(url, { headers: options?.headers })
            .setHeader("User-Agent", "GetData/1.0")
        .end().on("response", (response) => {
            if(options.passRes) {
                resolve(response);
            } else {
                let data = "";
                response.on("data", (chunk) => {
                    data += chunk.toString();
                }).on("end", () => {
                    if(response.statusCode && response.statusCode < 400) {
                        if(options.followRedirects && [ 301, 302, 303, 307, 308 ].includes(response.statusCode)) {
                            if(response.headers.location) {
                                get(response.headers.location, options).then(resolve).catch(reject);
                            } else {
                                reject(`"${url}" gave me a redirection response, but not where to redirect to...`);
                            }
                        } else {
                            if(response.headers["content-type"]?.includes("application/json")) {
                                try { resolve({ content: JSON.parse(data), headers: response.headers, statusCode: response.statusCode, statusMessage: response.statusMessage }); } 
                                catch(e) { reject(e); }
                            } else {
                                resolve({ content: data, headers: response.headers, statusCode: response.statusCode, statusMessage: response.statusMessage });
                            }
                        }
                    } else {
                        let retData;
                        if(response.headers["content-type"]?.includes("application/json")) {
                            try { retData = JSON.parse(data); }
                            catch(e) { reject(e); }
                        } else {
                            retData = data;
                        }
                        reject({ 
                            error: `URL sent back${response.statusCode ? ` non-OK status code - ${response.statusCode}${response.statusMessage ? `: ${response.statusMessage}` : ""}` : " no status code"}`,
                            content: retData
                        });
                    }
                }).on("error", (err: Error) => {
                    reject(err);
                });
            }
        });
    });
}

function printLine(text: string) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(text);
}

function truncate(text: any, length: number) {
    if(text.length > length) { return text.substring(0, length-1) + "…"} 
    else { return text }
}