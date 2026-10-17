import { Component, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { Platform,Profile,State } from './models';
import { ModsComponent } from './mods.component';

@Component({
  selector: 'app-root', standalone: true, imports: [FormsModule,ModsComponent],
  template: `
  <aside class="sidebar">
    <a class="brand" href="#"><span class="brand-icon">◉</span><span>orbit<small>AMONG US MANAGER</small></span></a>
    <div class="nav-label">WORKSPACE</div>
    <button class="nav-item" [class.active]="tab() === 'profiles'" (click)="tab.set('profiles')"><span>▦</span> Meine Profile <b>{{state.profiles.length}}</b></button>
    <button class="nav-item" [class.active]="tab() === 'platforms'" (click)="tab.set('platforms')"><span>⌘</span> Plattformen</button>
    <div class="sidebar-bottom"><span class="status-dot"></span> Lokal gespeichert<small>Orbit / Version 1.0.0</small></div>
  </aside>
  <main>
    <header><span>Workspace <i>/</i> {{tab() === 'profiles' ? 'Meine Profile' : 'Plattformen'}}</span><span class="local-badge">● DESKTOP</span></header>
    @if (!desktop) { <div class="notice">Browser-Vorschau · Dateioperationen und Spielstart sind in der Electron-App verfügbar.</div> }
    @if (message()) { <div class="notice" [class.error]="isError()" role="status">{{message()}}<button (click)="message.set('')" aria-label="Meldung schließen">×</button></div> }
    @if (tab() === 'profiles') {
      <section class="hero"><div class="hero-copy"><div class="eyebrow">DEIN SPIEL. DEIN SETUP.</div><h1>Eine Crew.<br><span>Viele Möglichkeiten.</span></h1><p>Verwalte deine Among Us Installationen.<br>Getrennte Profile. Alles an einem Ort.</p><button class="primary" (click)="create()" [disabled]="busy()">＋ Profil erstellen</button></div><div class="space-art" aria-hidden="true"><div class="orbit-ring ring-one"></div><div class="orbit-ring ring-two"></div><span class="star s1">✧</span><span class="star s2">✦</span><span class="star s3">·</span><div class="crewmate"><div class="backpack"></div><div class="body"><div class="visor"></div></div><div class="leg left"></div><div class="leg right"></div></div><div class="planet"></div><span class="art-caption">READY FOR YOUR NEXT MISSION</span></div></section>
      <section class="section-heading"><div><h2>Meine Profile <span>{{state.profiles.length}}</span></h2><p>Wähle dein Setup und starte ins nächste Spiel.</p></div><div class="tools"><input class="search" aria-label="Profile suchen" placeholder="⌕  Profile suchen …" [(ngModel)]="query"><button class="secondary" (click)="create()" [disabled]="busy()">＋ Neues Profil</button></div></section>
      <div class="profile-grid">
        @for (profile of filtered; track profile.id; let i = $index) {
          <article class="profile-card"><div class="card-top"><span class="profile-icon" [class.epic]="profile.platform === 'Epic Games'">{{profile.platform === 'Steam' ? '◈' : 'E'}}</span><span class="platform-badge">{{profile.platform}}</span><button class="icon-button" [disabled]="busy()" (click)="edit(profile)" aria-label="Profil bearbeiten">•••</button></div><h3>{{profile.name}}</h3><div class="path" [title]="profile.directory">{{profile.directory || 'Noch kein Installationsordner'}}</div><button class="mod-manage" [disabled]="busy() || !profile.directory" (click)="openMods(profile)">◇ Mods & BepInEx verwalten</button><div class="card-divider"></div><div class="card-bottom"><span class="profile-state"><span class="status-dot" [class.unset]="!profile.directory"></span>{{profile.directory ? 'Konfiguriert' : 'Einrichtung offen'}}</span><button class="launch" [disabled]="busy() || !profile.directory" (click)="launch(profile)">▶ Starten</button></div></article>
        }
        <button class="add-card" (click)="create()" [disabled]="busy()"><span>＋</span><strong>Neues Profil</strong><small>Platz für dein nächstes Setup</small></button>
      </div>
      @if (query && !filtered.length) { <p class="muted">Keine Profile für „{{query}}“ gefunden.</p> }
      <div class="tip"><span>✧</span><div><strong>Ein sauberer Start für jedes Profil</strong><p>Hinterlege unter Plattformen deine Originaldateien und kopiere sie in einen leeren Profilordner.</p></div><button (click)="tab.set('platforms')">Plattformen einrichten →</button></div>
    } @else {
      <section class="section-heading platform-heading"><div><div class="eyebrow">VERBINDUNGEN</div><h1>Deine Plattformen</h1><p>Lege fest, wo die originalen Spieldateien liegen.</p></div></section>
      <div class="settings-grid">@for (platform of platforms; track platform) {<section class="settings-card"><div class="platform-title"><span class="profile-icon" [class.epic]="platform === 'Epic Games'">{{platform === 'Steam' ? '◈' : 'E'}}</span><div><h2>{{platform}}</h2><p>Originalinstallation</p></div></div><label>ORDNER MIT AMONG US.EXE</label><div class="folder-input"><input [(ngModel)]="state.originals[platform]" placeholder="Installationsordner auswählen" [disabled]="busy()"><button [disabled]="busy()" (click)="pickOriginal(platform)">Durchsuchen</button></div><p class="help">{{platform === 'Steam' ? 'Steam muss beim Start angemeldet sein. Profilkopien werden mit der Steam App-ID 945360 gestartet.' : 'Epic authentifiziert über seinen Launcher. Startbar ist der dort registrierte Installationsordner.'}}</p>@if (platform === 'Epic Games') {<label>EPIC-START-URI</label><input class="full-input" [(ngModel)]="state.epicLaunchUri" [disabled]="busy()" placeholder="com.epicgames.launcher://apps/…?action=launch&silent=true"><p class="help">Aus einer vom Epic Launcher erstellten Desktop-Verknüpfung (.url) die vollständige URL übernehmen.</p>}</section>}</div>
      <button class="primary" (click)="saveSettings()" [disabled]="busy()">Einstellungen speichern</button>
      <div class="tip"><span>ⓘ</span><div><strong>Originaldateien bleiben in deinem Besitz</strong><p>Orbit lädt keine Spieldateien herunter. Verwende deine eigene, legal installierte Steam- oder Epic-Version.</p></div></div>
    }
    <footer><span>ORBIT <i>·</i> Among Us Profile Manager</span><span>Bereit für die nächste Runde ✧</span></footer>
  </main>
  @if (draft; as d) {<div class="modal-backdrop" (click)="close()"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" (click)="$event.stopPropagation()"><div class="modal-header"><div><div class="eyebrow">DEIN SETUP</div><h2 id="dialog-title">{{isNew ? 'Profil erstellen' : 'Profil bearbeiten'}}</h2></div><button class="icon-button" (click)="close()" [disabled]="busy()" aria-label="Schließen">×</button></div><label for="name">PROFILNAME</label><input id="name" class="full-input" [(ngModel)]="d.name" maxlength="80" placeholder="z. B. Meine Mod-Runde" [disabled]="busy()"><label for="platform">AUTH-SYSTEM</label><select id="platform" [(ngModel)]="d.platform" [disabled]="busy()"><option>Steam</option><option>Epic Games</option></select><label for="directory">INSTALLATIONSORDNER</label><div class="folder-input"><input id="directory" [(ngModel)]="d.directory" placeholder="Ordner für dieses Profil" [disabled]="busy()"><button (click)="pickDraft()" [disabled]="busy()">Durchsuchen</button></div><p class="help">Steam: eigener Profilordner möglich. Epic: zum Starten den im Epic Launcher registrierten Ordner wählen.</p>@if (!isNew) {<div class="profile-actions"><button class="secondary" (click)="prepare(d)" [disabled]="busy()">Originaldateien kopieren</button><button class="secondary" (click)="openFolder(d)" [disabled]="busy()">Ordner öffnen ↗</button></div><p class="help">Kopiert in einen leeren Ordner. Vorhandene Dateien werden niemals überschrieben. Bei Abbruch können Teilkopien zurückbleiben.</p>}<div class="modal-footer">@if (!isNew) {<button class="danger" [disabled]="busy()" (click)="remove(d)">{{confirmDelete ? 'Wirklich entfernen?' : 'Profil entfernen'}}</button>}<button class="secondary" [disabled]="busy()" (click)="close()">Abbrechen</button><button class="primary" [disabled]="busy() || !d.name.trim()" (click)="saveDraft()">{{busy() ? 'Bitte warten …' : 'Profil speichern'}}</button></div><p class="help">Beim Entfernen eines Profils bleiben alle Spieldateien erhalten.</p></section></div>}
  @if (draft && message()) {<div class="modal-feedback notice" [class.error]="isError()" role="status">{{message()}}<button (click)="message.set('')" aria-label="Meldung schließen">×</button></div>}
  @if (modProfile; as profile) {<app-mods [profile]="profile" (closed)="modProfile=null" />}
  @if (busy()) {<div class="busy-indicator" role="status">◌ {{activity()}}</div>}
  `
})
class App {
  readonly desktop = !!window.manager;
  readonly platforms: Platform[] = ['Steam','Epic Games'];
  state: State = {profiles:[],originals:{Steam:'','Epic Games':''},epicLaunchUri:''};
  tab = signal<'profiles'|'platforms'>('profiles');
  message = signal(''); isError = signal(false); busy = signal(false); activity = signal('');
  query = ''; draft: Profile|null = null; isNew = false; confirmDelete = false;
  modProfile: Profile|null = null;
  constructor() { if (window.manager) void this.run('Profile laden',async () => {this.state = await window.manager!.load();}); }
  get filtered() { return this.state.profiles.filter(p => p.name.toLocaleLowerCase().includes(this.query.toLocaleLowerCase())); }
  async run(label: string, action: () => Promise<void>) { if (this.busy()) return; this.busy.set(true); this.activity.set(label); try {await action();} catch(e) { this.isError.set(true); this.message.set(e instanceof Error ? e.message : String(e)); } finally {this.busy.set(false);} }
  notify(text: string) { this.isError.set(false); this.message.set(text); }
  api() { if (!window.manager) throw new Error('Bitte die Desktop-App mit npm start öffnen.'); return window.manager; }
  create() {this.message.set('');this.isNew=true; this.confirmDelete=false; this.draft={id:crypto.randomUUID(),name:'',platform:'Steam',directory:''};}
  edit(p: Profile) {this.message.set('');this.isNew=false;this.confirmDelete=false;this.draft={...p};}
  openMods(p:Profile){this.modProfile={...p};}
  close() {if (!this.busy()) this.draft=null;}
  async persist(next: State) {this.state = await this.api().save(next);}
  saveDraft() {const d=this.draft; if (!d) return; void this.run('Profil speichern', async () => {await this.persist({...this.state, profiles:this.isNew ? [...this.state.profiles,d] : this.state.profiles.map(p => p.id===d.id ? d : p)});this.draft=null;this.notify('Profil gespeichert.');});}
  saveSettings() {void this.run('Einstellungen speichern',async () => {await this.persist(this.state);this.notify('Plattformen gespeichert.');});}
  pickOriginal(p: Platform) {void this.run('Ordner auswählen',async () => {const dir=await this.api().pickFolder();if(dir)this.state.originals[p]=dir;});}
  pickDraft() {void this.run('Ordner auswählen',async () => {const dir=await this.api().pickFolder();if(dir && this.draft)this.draft.directory=dir;});}
  prepare(p: Profile) {void this.run('Originaldateien werden kopiert …',async () => {await this.persist({...this.state,profiles:this.state.profiles.map(item => item.id===p.id ? p : item)});this.notify(await this.api().prepare(p.id));});}
  launch(p: Profile) {void this.run('Spiel wird gestartet …',async () => this.notify(await this.api().launch(p.id)));}
  openFolder(p: Profile) {void this.run('Ordner öffnen',async () => {await this.persist({...this.state,profiles:this.state.profiles.map(item => item.id===p.id ? p : item)});await this.api().openFolder(p.id);});}
  remove(p: Profile) {if (!this.confirmDelete) {this.confirmDelete=true;return;} void this.run('Profil entfernen',async () => {await this.persist({...this.state,profiles:this.state.profiles.filter(item=>item.id!==p.id)});this.draft=null;this.notify('Profil entfernt. Spieldateien wurden beibehalten.');});}
}
bootstrapApplication(App).catch(console.error);
