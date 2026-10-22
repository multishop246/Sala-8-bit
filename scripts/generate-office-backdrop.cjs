const fs = require('fs');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200" viewBox="0 0 1800 1200"><defs><linearGradient id="sky" x2=".3" y2="1"><stop stop-color="#bdc8ef"/><stop offset=".6" stop-color="#e6d1e1"/><stop offset="1" stop-color="#baccc7"/></linearGradient><filter id="blur"><feGaussianBlur stdDeviation="5"/></filter><radialGradient id="haze"><stop stop-color="#fff5df" stop-opacity=".35"/><stop offset="1" stop-color="#c7c7e9" stop-opacity=".05"/></radialGradient></defs><path fill="url(#sky)" d="M0 0h1800v1200H0z"/><g filter="url(#blur)">`;
// Deterministic miniature city: roof, sunlit facade, shadow facade and windows.
for (let row = 0; row < 5; row++) for (let col = -1; col < 9; col++) {
 const x=col*245+(row%2)*115,y=row*300-120,w=95+(col*37+row*13+100)%55,h=100+Math.abs(col*61+row*43)%220;
 svg+=`<path fill="#a9b7cc" opacity=".4" d="M${x-20} ${y+120}l170 90 120-70-165-90z"/><path fill="#b5b1d0" d="M${x} ${y-h}l${w} 45v${h}l-${w}-45z"/><path fill="#8c9fbe" d="M${x+w} ${y-h+45}l65-38v${h}l-65 38z"/><path fill="#e0cfda" d="M${x} ${y-h}l65-38 ${w} 45-65 38z"/>`;
 for(let wy=20;wy<h-15;wy+=30)for(let wx=12;wx<w-12;wx+=24)svg+=`<path fill="${(wx+wy)%4?'#dfd8e9':'#ffe6b9'}" opacity=".75" d="M${x+wx} ${y-h+wy+wx*.47}l11 5v14l-11-5z"/>`;
}
for(let i=0;i<75;i++){
 const x=(i*317)%1900-50,y=90+(i*173)%1150,r=24+i%7*4;
 svg+=`<ellipse fill="#748b8a" opacity=".2" cx="${x+15}" cy="${y+44}" rx="${r*1.2}" ry="15"/><path stroke="#9b8b77" stroke-width="8" d="M${x} ${y}v45"/>`;
 for(let j=0;j<5;j++)svg+=`<circle fill="${['#8db783','#adc787','#78a482','#b0ce93','#8bb494'][j]}" cx="${x+Math.sin(j*2.4)*r*.5}" cy="${y+Math.cos(j*2.4)*r*.4}" r="${r*.72}"/>`;
}
svg+='</g><path fill="url(#haze)" d="M0 0h1800v1200H0z"/></svg>';
fs.mkdirSync('public/scenery',{recursive:true}); fs.writeFileSync('public/scenery/city.svg',svg);
