import { TitleCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, inject } from '@angular/core';
import { FormArray, FormControl, ReactiveFormsModule } from '@angular/forms';
import { type MatButtonAppearance, MatButtonModule } from '@angular/material/button';
import { type MatCardAppearance, MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { APPLICATION_UPDATES_SHOW_DEMO_MESSAGE } from '@lingo-daily/ng-bricks/application-updates';

@Component({
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    TitleCasePipe,
  ],
  selector: 'ldpk-theme-showcase',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './theme-showcase.scss',
  templateUrl: './theme-showcase.html',
})
export class ThemeShowcase {
  private readonly document = inject(DOCUMENT);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly buttonColors = ['primary', 'secondary', 'tertiary', 'accent', 'warn'];
  protected readonly buttonAppearances: MatButtonAppearance[] = [
    'text',
    'filled',
    'elevated',
    'outlined',
    'tonal',
  ];
  protected readonly cardAppearances: MatCardAppearance[] = ['raised', 'filled', 'outlined'];

  protected readonly buttonClasses = new FormArray(
    ['primary', 'accent', 'warn'].map(
      (buttonClass) => new FormControl(buttonClass, { nonNullable: true }),
    ),
  );
  protected readonly formClass = new FormControl('', { nonNullable: true });
  protected readonly windowMessage = new FormControl(APPLICATION_UPDATES_SHOW_DEMO_MESSAGE, {
    nonNullable: true,
  });

  addButtonClass(): void {
    this.buttonClasses.push(new FormControl('your-button-class', { nonNullable: true }));
  }

  openSnackBar(message: string, panelClass = ''): void {
    this.snackBar.open(message, '×', { panelClass });
  }

  postWindowMessage(): void {
    this.document.defaultView?.postMessage(this.windowMessage.value);
  }
}
