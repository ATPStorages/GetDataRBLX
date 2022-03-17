# GetDataRBLX
Created because I felt [Chedski/rbxaudiodl](https://github.com/Chedski/rbxaudiodl) was insufficient

-----
Building
--
Before following these instructions, ensure you have a supported version of [Node.js](https://nodejs.org/en/) installed on your computer (>16.x.x), along with the latest release of the [Node Package Manager](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) (NPM.)

For the next steps, you will need to open your system's terminal.

* Windows
    * OS Key + R
      * Windows 7 and up: `cmd.exe`
  * Right click on the Windows start menu Icon.
    * Windows 10 and up: `powershell` 
    * Windows 11 and up: `Windows Terminal`
* Macintosh / Darwin
  * Spotlight / Launchpad
    * Search "Terminal"
  * Finder
    * /Applications/Utilities/Terminal.app
* Linux / Other non-standard operating systems
  * I expect you to know what you are doing.

*Note: Typically you will need to run your Terminal as an administrative user to install global commands. If you already have most of these installed, however, you can move on.*

If you don't already have the `tsc` (TypeScript Compiler) command installed on your computer, run `npm install -g typescript`.

[Download](https://github.com/ATPStorages/GetDataRBLX/archive/refs/heads/master.zip) and extract the `main` branch of GetDataRBLX.
Using `cd` (or opening a terminal in the new folder), navigate to the extracted folder's contents.

Run `npm ci`, and wait until it is finished - You will notice a *lot* (>100) folders appear in the `.\node_modules` folder; this is normal.

Run `tsc` with no arguments, and wait until you see a new file called `index.js` pops up.
Run `node .` or `node .\index.js`. You are finished. 

Packaging
--
Install `pkg` by running `npm install -g pkg`.
Run `pkg .\package.json` in the extracted branches' directory.

*Note: By default, this step will build 3 separate applications for Windows, Mac, and Linux to the `.\dist` directory. Since this might take quite a bit, you can remove platforms you dont need in the `pkg` section of `package.json`. You can customize this even more by using the PKG docs at https://github.com/vercel/pkg.*
