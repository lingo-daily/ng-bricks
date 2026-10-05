import { DOCUMENT } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { APPLICATION_UPDATES_SHOW_DEMO_MESSAGE } from '@lingo-daily/ng-bricks/application-updates';
import { ThemeShowcase } from './theme-showcase';

describe('ThemeShowcase', () => {
  let fixture: ComponentFixture<ThemeShowcase>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThemeShowcase],
      providers: [provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(ThemeShowcase);
    await fixture.whenStable();
  });

  function buttonByText(text: string): HTMLButtonElement {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    const button = buttons.find((candidate) => candidate.textContent?.trim() === text);
    if (!button) {
      throw new Error(`No button with text "${text}"`);
    }
    return button;
  }

  function buttonClassInputs(): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('input[placeholder="Ex. accent"]'));
  }

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should add a button class row', async () => {
    expect(buttonClassInputs().length).toBe(3);

    buttonByText('add Add Button Class').click();
    await fixture.whenStable();

    const inputs = buttonClassInputs();
    expect(inputs.length).toBe(4);
    expect(inputs[3].value).toBe('your-button-class');
  });

  it('should apply an edited button class to its row', async () => {
    const [input] = buttonClassInputs();
    input.value = 'custom';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('div.row.custom')).not.toBeNull();
  });

  it('should open a snackbar with the given panel class', () => {
    const snackBar = TestBed.inject(MatSnackBar);
    const open = vi.spyOn(snackBar, 'open');

    buttonByText('Error').click();

    expect(open).toHaveBeenCalledWith('This is an error snackbar', '×', { panelClass: 'error' });
  });

  it('should post the window message', () => {
    const window = TestBed.inject(DOCUMENT).defaultView!;
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);

    buttonByText('Post').click();

    expect(postMessage).toHaveBeenCalledWith(APPLICATION_UPDATES_SHOW_DEMO_MESSAGE);
  });
});
