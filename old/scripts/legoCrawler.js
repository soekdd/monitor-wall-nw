const width = 800;
const eldest = 300;
const firstDelay = 10000;
const path = '../fotos/Lego Ideas/';
const axios = require('axios');
const fs = require('fs');
var html = "";
async function fetchStep1(offset){
  // Make a request for a user with a given ID
  //https://ideas.lego.com/blogs/a4ae09b6-0d4c-4307-9da8-3ee9f3d368d6/most_recent?limit=100  
  console.log('running with offset',offset);
  const url = 'https://ideas.lego.com/search/global_search/ideas?query=&sort=most_recent';
  const { data, headers } = await axios.post(url, {  
    sort: ["most_recent:desc"],
    limit: 20,
    "offset": offset,
    globalSearch: true,
    filters: {content: "", tags: [], activity_fields: [], idea_phase: ["idea_gathering_support"]},
    layout: ""}
  )
  .catch(function (error) {
    // handle error
    console.log('Error',error.code);
  });
  fetchStep2(data.results);
}
async function fetchStep2(ideas){
  ideas.forEach(async function(e){
    //console.log(e.entity_details.image_url);
    let parts = e.entity_details.image_url.split(':');    
    parts[3]=Math.round(parts[3]*width/parts[2]);
    parts[2]=width;
    let url=parts.join(':');
    let filename = path+url.split('/')[8]+'.jpg';
    html += '<img src="'+filename+'">';
    await fetchStep3(url);
  });
  fs.writeFileSync('testLego.html',html);
}

async function fetchStep3 (url) {  
  let filename = path+url.split('/')[8]+'.jpg';
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
  for(let i=0;i<eldest;i=i+20) {  
    await fetchStep1(i);
  }
  fs.readdir(path, function(err, files) {
    deleteEldestFiles(files,path);
  });
}

setTimeout(main,firstDelay);
