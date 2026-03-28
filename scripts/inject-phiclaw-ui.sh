#!/usr/bin/env bash
#
# inject-phiclaw-ui.sh — Injecte les toggles PhiClaw dans l'index.html après le build UI
#
# Ce script est conçu pour être exécuté APRÈS `pnpm ui:build` dans le Dockerfile.
# Il lit le fichier index.html généré par Vite (avec les bons hashes de fichiers)
# et injecte le panneau de toggles PhiClaw avant la balise </body>.
#
# Usage: ./scripts/inject-phiclaw-ui.sh [path-to-index.html]
#
set -euo pipefail

INDEX_HTML="${1:-/app/dist/control-ui/index.html}"

if [[ ! -f "$INDEX_HTML" ]]; then
    echo "[inject-phiclaw-ui] ERROR: ${INDEX_HTML} not found"
    exit 1
fi

echo "[inject-phiclaw-ui] Injecting PhiClaw toggles into ${INDEX_HTML}..."

# The PhiClaw toggle panel HTML + CSS + JS to inject before </body>
PHICLAW_INJECT='
    <div id="phi-toggles-panel" style="position:fixed;bottom:80px;left:16px;background:#1e1e2e;border:1px solid #45475a;border-radius:12px;padding:10px 14px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.3);min-width:200px;max-width:230px;transition:all 0.3s ease;">
      <button onclick="var p=document.getElementById('\''phi-toggles-body'\'');var b=this;if(p.style.display==='\''none'\''){p.style.display='\''block'\'';b.textContent='\''▼'\''}else{p.style.display='\''none'\'';b.textContent='\''▲'\''}" style="position:absolute;top:6px;right:10px;background:none;border:none;color:#6c7086;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:4px;">▼</button>
      <h3 style="margin:0 0 10px;font-size:13px;color:#cdd6f4;font-weight:600;letter-spacing:0.5px;">⚡ PhiClaw</h3>
      <div id="phi-toggles-body">
        <div style="display:flex;align-items:center;justify-content:space-between;margin:8px 0;gap:12px;">
          <span style="font-size:12px;color:#bac2de;white-space:nowrap;">🎯 Orchestrateur</span>
          <label style="position:relative;width:40px;height:22px;flex-shrink:0;display:inline-block;">
            <input type="checkbox" id="phi-orch-toggle" checked style="opacity:0;width:0;height:0;" onchange="window.__phiToggle('\''orchestrator'\'',this.checked)">
            <span class="phi-slider" style="position:absolute;cursor:pointer;inset:0;background:#45475a;border-radius:22px;transition:.3s;"></span>
          </label>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin:8px 0;gap:12px;">
          <span style="font-size:12px;color:#bac2de;white-space:nowrap;">🧠 Prompt Engineer</span>
          <label style="position:relative;width:40px;height:22px;flex-shrink:0;display:inline-block;">
            <input type="checkbox" id="phi-pe-toggle" checked style="opacity:0;width:0;height:0;" onchange="window.__phiToggle('\''promptEngineer'\'',this.checked)">
            <span class="phi-slider" style="position:absolute;cursor:pointer;inset:0;background:#45475a;border-radius:22px;transition:.3s;"></span>
          </label>
        </div>
        <div id="phi-toggle-status" style="font-size:10px;color:#6c7086;margin-top:4px;text-align:right;"></div>
      </div>
    </div>
    <style>
      .phi-slider:before{content:"";position:absolute;height:16px;width:16px;left:3px;bottom:3px;background:#cdd6f4;border-radius:50%;transition:.3s;}
      input:checked+.phi-slider{background:#a6e3a1!important;}
      input:checked+.phi-slider:before{transform:translateX(18px);background:#1e1e2e;}
    </style>
    <script>
      window.__phiToggle=async function(section,enabled){
        var status=document.getElementById("phi-toggle-status");
        status.textContent="Mise à jour...";
        status.style.color="#f9e2af";
        try{
          var app=document.querySelector("openclaw-app");
          var client=null;
          if(app&&app.shadowRoot){
            var root=app.shadowRoot;
            var walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT);
            while(walker.nextNode()){
              if(walker.currentNode.client&&typeof walker.currentNode.client.request==="function"){
                client=walker.currentNode.client;
                break;
              }
            }
          }
          if(client){
            var snap=await client.request("config.get",{});
            var cfg=JSON.parse(JSON.stringify(snap.config||{}));
            if(!cfg[section])cfg[section]={};
            cfg[section].enabled=enabled;
            var raw=JSON.stringify(cfg,null,2)+"\n";
            await client.request("config.apply",{raw:raw,baseHash:snap.hash});
            status.textContent=section==="orchestrator"
              ?"Orchestrateur "+(enabled?"activé ✅":"désactivé ❌")
              :"Prompt Engineer "+(enabled?"activé ✅":"désactivé ❌");
            status.style.color=enabled?"#a6e3a1":"#f38ba8";
          }else{
            status.textContent="Connectez-vous d abord";
            status.style.color="#f38ba8";
          }
        }catch(err){
          status.textContent="Erreur: "+(err.message||err);
          status.style.color="#f38ba8";
        }
        setTimeout(function(){status.textContent="";status.style.color="#6c7086";},3000);
      };
      var _phiInitInterval=setInterval(function(){
        try{
          var app=document.querySelector("openclaw-app");
          if(!app||!app.shadowRoot)return;
          var root=app.shadowRoot;
          var walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT);
          var client=null;
          while(walker.nextNode()){
            if(walker.currentNode.client&&typeof walker.currentNode.client.request==="function"){
              client=walker.currentNode.client;
              break;
            }
          }
          if(!client)return;
          clearInterval(_phiInitInterval);
          client.request("config.get",{}).then(function(snap){
            var cfg=snap.config||{};
            document.getElementById("phi-orch-toggle").checked=cfg.orchestrator?cfg.orchestrator.enabled!==false:true;
            document.getElementById("phi-pe-toggle").checked=cfg.promptEngineer?cfg.promptEngineer.enabled!==false:true;
            var s=document.getElementById("phi-toggle-status");
            s.textContent="Connecté ✅";s.style.color="#a6e3a1";
            setTimeout(function(){s.textContent="";},2000);
          });
        }catch(e){}
      },2000);
    </script>'

# Check if already injected (idempotent)
if grep -q 'phi-toggles-panel' "$INDEX_HTML"; then
    echo "[inject-phiclaw-ui] PhiClaw toggles already present — skipping"
    exit 0
fi

# Inject before </body>
# Use a temp file to avoid sed issues with multiline content
TEMP_FILE="$(mktemp)"
awk -v inject="$PHICLAW_INJECT" '
    /<\/body>/ { print inject }
    { print }
' "$INDEX_HTML" > "$TEMP_FILE"

mv "$TEMP_FILE" "$INDEX_HTML"

echo "[inject-phiclaw-ui] ✅ PhiClaw toggles injected successfully"
