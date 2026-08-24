import { bootstrapApplication } from '@angular/platform-browser'
import { provideServerRendering } from '@angular/platform-server'
import { provideExperimentalZonelessChangeDetection } from '@angular/core'
import { AppComponent } from './app/app.component'

export default function bootstrap() {
    return bootstrapApplication(AppComponent, {
        providers: [
            provideServerRendering(),
            provideExperimentalZonelessChangeDetection(),
        ],
    })
}
