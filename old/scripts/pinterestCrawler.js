const eldest = 300;
const firstDelay = 20000;
const path = '../fotos/Pinterest/';
const axios = require('axios');
const fs = require('fs');
const pinterestAPI = require('pinterest-api');
var html = '';
let boards = [
    'DPCustomWorks/wood-wall-art/'
    ,'DPCustomWorks/modern-home-decor/'
    ,'DPCustomWorks/mixed-media-joinery/'
    ,'DPCustomWorks/tables/'
    ,'DPCustomWorks/assemblage/'
    ,'DPCustomWorks/spiral-sculpture/'
    ,'DPCustomWorks/the-wooden-kitchen/'
];
let images = [];

async function asyncForEach(array, callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }

async function fetchStep3 (url,filename) {  
    if (fs.existsSync(filename)) return;
    const { data, headers } = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    const writer = fs.createWriteStream(filename);
    console.log(filename);
    data.pipe(writer);
}

async function fetchStep1(){
    await asyncForEach(boards,async b=>{
        parts = b.split('/');
        // Create a new object and set the accountname
        var pinterest = pinterestAPI(parts[0]);        
        // Get pins from a board (second parameter determines whether you want the results paginated and to include some metadata)
        await pinterest.getPinsFromBoard(parts[1], true, async pins=>{            
            await asyncForEach(pins.data,async e => {
                let highestWidth = 0;
                let url = null;
                Object.keys(e.images).forEach(i=>{
                    if (e.images[i].width>highestWidth) url = e.images[i].url;
                })
                let filename = path+url.split('/')[7];
                html += '<img src="'+filename+'">';
                await fetchStep3(url,filename);         
            });;
        });        
    });
}

function deleteEldestFiles(files, path) {
    var out = [];
    files.forEach(function(file) {
        var stats = fs.statSync(path + "/" +file);
        if(stats.isFile()) {
            out.push({"file":file, "mtime": stats.mtime.getTime()});
        }
    });
    if (out.length>eldest) {
        out.sort(function(a,b) {
            return b.mtime - a.mtime;
        });
        for(let i=eldest;i<out.length;i++) {
        console.log('Delete ',path+out[i].file);
        fs.unlinkSync(path+out[i].file);
        }
    }
}
  
async function main () {
    await fetchStep1();
    setTimeout(()=>fs.writeFileSync('testPinterest.html',html),20000);
    fs.readdir(path, function(err, files) {
      deleteEldestFiles(files,path);
    });
  }
  
setTimeout(main,firstDelay);
  