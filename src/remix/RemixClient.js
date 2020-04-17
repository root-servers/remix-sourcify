import {createIframeClient, PluginClient} from '@remixproject/plugin';
import axios from 'axios';
import { SERVER_URL, REPOSITORY_URL } from '../common/Constants';

export class RemixClient extends PluginClient {

    constructor() {
        super();
        this.client = createIframeClient();
        this.methods = ["fetch", "verify"];
    }

    createClient = () => {
        return this.client.onload();
    }

    getFile = async (name) => {
        return new Promise(async (resolve, reject) => {
            let path = name.startsWith('./') ? name.substr(2) : name;
            let content = await this.client.call('fileManager', 'getFile', this.getBrowserPath(path));
            if (content) {
                resolve(content);
            } else {
                reject(`Could not find "${name}"`)
            }
        });
    }

    getFolderByAddress = async (address) => {
        return this.client.call('fileManager', 'getFolder', this.getBrowserPath(address))
    }

    getCurrentFile = async () => {
        return this.client.call('fileManager', 'getCurrentFile');
    }

    createFile = async (name, content) => {
        try {
            await this.client.call('fileManager', 'setFile', name, content)
        } catch (err) {
            console.log(err)
        }
    }

    switchFile = async (name) => {
        await this.client.call('fileManager', 'switchFile', name)
    }

    getBrowserPath = (path) => {
        if (path.startsWith('browser/')) {
            return path;
        }
        return `browser/${path}`;
    }

    contentImport = async (stdUrl) => {
        await this.client.call('contentImport', 'resolve', stdUrl)
    }

    listenOnCompilationFinishedEvent = async (callback) => {
        await this.client.onload();
        this.client.on('solidity', 'compilationFinished', (target, source, _version, data) => {
            callback({ 
                target, 
                source: source.sources[target].content, 
                contract: data.contracts[target] 
            });
        });
    }

    detectNetwork = async () => {
        await this.client.onload();
        return await this.client.call('network', 'detectNetwork')
    }

    fetch = async (address) => {
        return new Promise(async (resolve, reject) => {
            const network = await this.detectNetwork()
            let response = await axios.get(`${REPOSITORY_URL}/${network.id}/${address}`)
              
            if (!response) reject({info: `ŝource of ${address} not found on network ${network.id}`})
            if (!(response.status === 200)) reject({info: `${response.status}. Network: ${network.name}`}) 

            console.log(response)

            let metadata;
            let contract;
            for(let i in response.data){
                const file = response.data[i];
                if(file.name.endsWith('json')){
                    metadata = JSON.parse(file.content);
                } else if (file.name.endsWith('sol')){
                    contract = file.content;
                }
            };

            console.log(metadata)
            console.log(contract)

            let compilerVersion = metadata.compiler.version;
            let abi = JSON.stringify(metadata.output.abi, null, '\t');
            this.createFile(`${address}/metadata.json`, JSON.stringify(metadata, null, '\t'))
            let switched = false
            for (let file in metadata['sources']) {
                console.log(file)
                const urls = metadata['sources'][file].urls
                for (let url of urls) {
                    console.log("Url" + url)
                    if (url.includes('ipfs')) {
                        let stdUrl = `ipfs://${url.split('/')[2]}`
                        const source = await this.contentImport(stdUrl)
                        file = file.replace('browser/', '') // should be fixed in the remix IDE end.
                        console.log("Source :" + source)
                        //this.createFile(`${address}/${file}`, source.content) // TODO: Content seems empty
                        if (!switched) await this.switchFile(`${address}/${file}`)
                        switched = true
                        break
                    }
                }
            }
            resolve({ "metadata": metadata, "contract": contract });
          });
    }


    verify = async (formData) => {
        return axios.post(`${SERVER_URL}`, formData);
    }
}

export const remixClient = new RemixClient()
