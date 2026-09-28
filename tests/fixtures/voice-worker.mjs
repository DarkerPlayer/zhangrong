import readline from 'node:readline';
for await (const line of readline.createInterface({input:process.stdin})) {
 const request=JSON.parse(line);
 if(request.cancel)continue;
 if(request.operation==='warmup'){process.stdout.write(JSON.stringify({id:request.id,ready:true})+'\n');continue;}
 if(request.text==='crash'){process.exit(2);}
 if(request.text==='hang'){await new Promise(resolve=>setTimeout(resolve,10000));}
 const audio=Buffer.alloc(48);audio.write('RIFF');audio.writeUInt32LE(40,4);audio.write('WAVE',8);audio.write('fmt ',12);audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(24000,24);audio.writeUInt32LE(48000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(4,40);audio.writeInt16LE(request.text==='pid'?process.pid%32767:request.text.length,44);
 if(request.stream){process.stdout.write(JSON.stringify({id:request.id,audio:audio.toString('base64'),chunk:true})+'\n');await new Promise(resolve=>setTimeout(resolve,60));process.stdout.write(JSON.stringify({id:request.id,done:true})+'\n');}
 else process.stdout.write(JSON.stringify({id:request.id,audio:audio.toString('base64')})+'\n');
}
