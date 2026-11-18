import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { LOCALE_ID } from '@angular/core';
registerLocaleData(localeEs);
bootstrapApplication(AppComponent, { providers: [provideHttpClient(), {provide:LOCALE_ID,useValue:'es-ES'}] }).catch(console.error);
