const eldest = 300;
const firstDelay = 15000;
const axios = require('axios');
const fs = require('fs');
const path = '../fotos/Rebrickable/';
const key = '368e6243e17e4956c8f4628cb6c590bb';


async function fetchApi(offset){
  // Make a request for a user with a given ID
  console.log('running with offset',offset);
  const url = 'https://rebrickable.com/api/v3/lego/mocs/MOC-'+offset+'/?key=368e6243e17e4956c8f4628cb6c590bb';
  const result = await axios.get(url)
  .catch(function (error) {
    // handle error
    console.log('.');    
  });
  if (result && result.data && result.data.num_parts>500) {
    console.log(result.data.moc_img_url);
    await getImage(result.data.moc_img_url,'moc-'+offset+'.jpg');
  }
}

async function getImage (url,filename) {  
  if (fs.existsSync(filename)) return;
  const { data, headers } = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });
  const writer = fs.createWriteStream(path + filename);
  console.log(filename);
  data.pipe(writer);
}

function deleteEldestFiles(files, path) {
  var out = [];
  files.forEach(function(file) {
      var stats = fs.statSync(path + file);
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
  files = fs.readdirSync(path)
  max = 0;
  for(let i=0;i<files.length;i++) {
    let parts = files[i].replace('.','-').split('-');
    if (max<parts[1]) max = parseInt(parts[1]);
  }
  //max = 37000;
  console.log(max);
  for (let c=max;c<max+100;c++) {
    await fetchApi(c);        
  }
  fs.readdir(path, function(err, files) {
    deleteEldestFiles(files,path);
  });  
}

setTimeout(main,firstDelay);
