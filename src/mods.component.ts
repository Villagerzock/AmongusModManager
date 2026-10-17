import {Component,EventEmitter,Input,OnDestroy,OnInit,Output,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Catalog,Mod,ModPlan,ModStatus,Profile} from './models';

@Component({
  selector:'app-mods',standalone:true,imports:[FormsModule],
  template:`
  <div class="modal-backdrop mods-backdrop" (click)="close()"><section class="modal mods-modal" role="dialog" aria-modal="true" aria-labelledby="mods-title" (click)="$event.stopPropagation()">
    <div class="modal-header"><div><div class="eyebrow">DEIN PROFIL · {{profile.name}}</div><h2 id="mods-title">Mods & BepInEx</h2></div><button class="icon-button" (click)="close()" [disabled]="busy()" aria-label="Schließen">×</button></div>
    <p class="help">Abhängigkeiten werden automatisch vor dem gewählten Mod installiert. Bitte das Spiel vorher schließen. Kombiniere große Rollen-Mods in getrennten Profilen.</p>
    <div class="mod-toolbar"><span class="catalog-source" [title]="catalog()?.source || ''">{{catalog()?.source || 'Katalog laden …'}}</span><span>{{status()?.architecture || (status()?.ready === false ? 'Spiel fehlt im Profil' : 'Architektur wird geprüft')}}</span><button class="secondary" [disabled]="busy()" (click)="load()">Neu laden</button></div>
    @if (message()) {<div class="notice" [class.error]="error()" role="status">{{message()}}</div>}
    @if (busy()) {<div class="mod-progress" role="status">◌ {{progress()}}</div>}
    @if (status()?.ready === false) {<section class="installation-plan profile-setup"><h3>Profilordner zuerst einrichten</h3><p class="help">{{status()?.message}}</p><p class="help">Orbit kann deine vorhandene Originalinstallation in diesen Profilordner kopieren. Hinterlege dafür unter Plattformen den Originalordner für {{profile.platform}}. Der Profilordner muss leer sein; bestehende Dateien werden nicht überschrieben.</p><button class="primary" [disabled]="busy()" (click)="prepareProfile()">Originaldateien ins Profil kopieren</button><p class="help">Falls das Spiel bereits an einem anderen Ort liegt: Dialog schließen, Profil bearbeiten und den Ordner mit Among Us.exe auswählen.</p></section>}
    @if (profile.platform === 'Epic Games') {<p class="help mod-warning">Epic startet weiterhin nur den registrierten Installationsordner. Mods können auch in einer Kopie installiert werden, diese ist dadurch aber nicht automatisch über Epic startbar.</p>}
    @if (catalog(); as c) {
      <div class="mod-list">@for (mod of c.registry.mods; track mod.id) {<article class="mod-item"><div class="mod-item-heading"><h3>{{mod.name}}</h3><span class="mod-installed" [class.modified]="installed(mod.id)?.intact === false">{{installedLabel(mod)}}</span></div><p>{{version(mod).description || mod.description}}</p><div class="mod-version-row"><label [for]="'mod-version-'+mod.id">MOD-VERSION</label><select [id]="'mod-version-'+mod.id" [ngModel]="version(mod).version" (ngModelChange)="chooseVersion(mod,$event)" [disabled]="busy()">@for(v of mod.versions;track v.version){<option [value]="v.version">{{v.version}}</option>}</select>@if(version(mod).gameVersion){<span>Benötigt Among Us {{version(mod).gameVersion}} · wird nicht geändert</span>}</div><div class="mod-item-bottom"><span>Abhängigkeiten: {{dependencyNames(mod)}}</span><button class="secondary" [disabled]="busy() || !status() || !available(mod)" (click)="select(mod)">{{available(mod) ? 'Installation vorbereiten' : 'Für dieses Profil nicht verfügbar'}}</button></div></article>}</div>
    }
    @if (plan(); as p) {<section class="installation-plan"><h3>Diese Pakete werden installiert</h3><ol>@for (mod of p.mods; track mod.id) {<li><strong>{{mod.name}} · {{mod.version}}</strong><small>{{mod.url}}</small><span>{{mod.verified ? 'SHA256-Prüfsumme hinterlegt' : 'Keine Prüfsumme im Katalog hinterlegt'}}</span></li>}</ol><p class="help">Ziel: {{profile.directory}}<br>Vorhandene Loader- und Mod-Dateien können ersetzt werden. Orbit sichert sie vorher und setzt Änderungen bei Fehlern zurück. Die Spielversion muss zu den Mod-Beschreibungen passen.</p><div class="plan-buttons"><button class="secondary" [disabled]="busy()" (click)="plan.set(null)">Abbrechen</button><button class="primary" [disabled]="busy()" (click)="install()">{{busy() ? 'Bitte warten …' : 'Jetzt installieren'}}</button></div></section>}
    @if (backup()) {<p class="help backup-location">Sicherung der Installation: {{backup()}}</p>}
    <div class="modal-footer"><button class="secondary" [disabled]="busy()" (click)="close()">Schließen</button></div>
  </section></div>
  `
})
export class ModsComponent implements OnInit,OnDestroy {
  @Input({required:true})profile!:Profile;
  @Output()closed=new EventEmitter<void>();
  catalog=signal<Catalog|null>(null);status=signal<ModStatus|null>(null);plan=signal<ModPlan|null>(null);
  busy=signal(false);message=signal('');error=signal(false);progress=signal('');backup=signal('');
  private unsubscribe?:()=>void;
  selectedVersions=signal<Record<string,string>>({});
  ngOnInit(){this.unsubscribe=window.manager?.onModProgress(message=>this.progress.set(message));void this.load();}
  ngOnDestroy(){this.unsubscribe?.();}
  close(){if(!this.busy())this.closed.emit();}
  private api(){if(!window.manager)throw new Error('Mods lassen sich nur in der Electron-App installieren.');return window.manager;}
  private async run(label:string,fn:()=>Promise<void>){if(this.busy())return;this.busy.set(true);this.progress.set(label);this.message.set('');this.error.set(false);try{await fn();}catch(error){this.error.set(true);this.message.set(error instanceof Error?error.message:String(error));}finally{this.busy.set(false);}}
  async load(){await this.run('mods.json und Profil prüfen …',async()=>{this.plan.set(null);this.status.set(null);this.catalog.set(await this.api().modCatalog());this.applyStatus(await this.api().modStatus(this.profile.id));});}
  private applyStatus(status:ModStatus){
    this.status.set(status);
    this.selectedVersions.update(current=>{
      const next={...current};
      for(const item of status.installed)if(this.catalog()?.registry.mods.find(mod=>mod.id===item.id)?.versions.some(version=>version.version===item.version))next[item.id]=item.version;
      return next;
    });
  }
  installed(id:string){return this.status()?.installed.find(item=>item.id===id);}
  prepareProfile(){void this.run('Originaldateien ins Profil kopieren …',async()=>{const message=await this.api().prepare(this.profile.id);this.applyStatus(await this.api().modStatus(this.profile.id));this.message.set(message);});}
  installedLabel(mod:Mod){const item=this.installed(mod.id);return !item?'Nicht installiert':!item.intact?'Dateien verändert / fehlen':'Installiert · '+item.version;}
  version(mod:Mod){return mod.versions.find(version=>version.version===this.selectedVersions()[mod.id])||mod.versions[0];}
  chooseVersion(mod:Mod,version:string){this.selectedVersions.update(current=>({...current,[mod.id]:version}));this.plan.set(null);}
  available(mod:Mod){const arch=this.status()?.architecture;const downloads=this.version(mod).downloads;return !!arch&&!!(downloads[arch]||downloads['any']);}
  dependencyNames(mod:Mod){return this.version(mod).dependencies.map(dependency=>(this.catalog()?.registry.mods.find(item=>item.id===dependency.id)?.name||dependency.id)+(dependency.version?' '+dependency.version:'')).join(', ')||'Keine';}
  select(mod:Mod){void this.run('Abhängigkeiten auflösen …',async()=>{this.plan.set(await this.api().modPlan(this.profile.id,mod.id,this.version(mod).version));});}
  install(){const plan=this.plan();if(!plan)return;void this.run('Installation vorbereiten …',async()=>{const result=await this.api().installMods(this.profile.id,plan.id);this.backup.set(result.backup);this.plan.set(null);this.applyStatus(await this.api().modStatus(this.profile.id));this.message.set(result.message);});}
}
