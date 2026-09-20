import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { FileUplink, FileUplinkSubmitPayload } from './file-uplink';

function createFile(name: string, type: string): File {
  return new File(['content'], name, { type });
}

describe('FileUplink', () => {
  let component: FileUplink;
  let fixture: ComponentFixture<FileUplink>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileUplink],
      providers: [provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(FileUplink);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  function fileInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input[type="file"]');
  }

  function urlInputs(): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('input[type="url"]'));
  }

  function findButtonByText(text: string): HTMLButtonElement | undefined {
    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    return buttons.find((button) => button.textContent?.trim() === text);
  }

  function submitButton(): HTMLButtonElement {
    const button = findButtonByText('Submit');
    if (!button) {
      throw new Error('Submit button not found');
    }
    return button;
  }

  async function selectUrlTab(): Promise<void> {
    const tabs: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]'));
    tabs[1].click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function selectFiles(files: File[]): Promise<void> {
    const input = fileInput();
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function setUrlInputValue(input: HTMLInputElement, value: string): Promise<void> {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('emitted payload shape', () => {
    it('emits { files } when submitting from File mode', async () => {
      await selectFiles([createFile('photo.png', 'image/png')]);

      const payloads: FileUplinkSubmitPayload[] = [];
      component.submit.subscribe((payload) => payloads.push(payload));
      submitButton().click();

      expect(payloads).toEqual([{ files: [expect.any(File)] }]);
      expect(payloads[0].files?.[0].name).toBe('photo.png');
    });

    it('emits { urls } when submitting from URL mode', async () => {
      await selectUrlTab();
      await setUrlInputValue(urlInputs()[0], 'https://example.com/a.png');

      const payloads: FileUplinkSubmitPayload[] = [];
      component.submit.subscribe((payload) => payloads.push(payload));
      submitButton().click();

      expect(payloads).toEqual([{ urls: ['https://example.com/a.png'] }]);
    });
  });

  describe('selectionChange output', () => {
    it('emits the current selection as it changes, using the same payload shape as submit', async () => {
      const payloads: FileUplinkSubmitPayload[] = [];
      component.selectionChange.subscribe((payload) => payloads.push(payload));

      await selectFiles([createFile('a.png', 'image/png')]);
      expect(payloads.at(-1)?.files?.map((file) => file.name)).toEqual(['a.png']);

      await selectUrlTab();
      expect(payloads.at(-1)).toEqual({ urls: [] });

      await setUrlInputValue(urlInputs()[0], 'https://example.com/a.png');
      expect(payloads.at(-1)).toEqual({ urls: ['https://example.com/a.png'] });
    });
  });

  describe('submit-disabled states', () => {
    it('disables submit when no file or URL is selected', () => {
      expect(submitButton().disabled).toBe(true);
    });

    it('enables submit once a file is selected in File mode', async () => {
      await selectFiles([createFile('photo.png', 'image/png')]);
      expect(submitButton().disabled).toBe(false);
    });

    it('keeps submit disabled for an invalid URL and enables it once valid', async () => {
      await selectUrlTab();
      const [input] = urlInputs();

      await setUrlInputValue(input, 'not a url');
      expect(submitButton().disabled).toBe(true);

      await setUrlInputValue(input, 'https://example.com/a.png');
      expect(submitButton().disabled).toBe(false);
    });
  });

  describe('single-vs-multiple preview switching', () => {
    it('shows a preview for exactly one selected image and hides it once a second is added', async () => {
      await fixture.componentRef.setInput('multiple', true);

      await selectFiles([createFile('a.png', 'image/png')]);
      expect(fixture.nativeElement.querySelector('.preview')).not.toBeNull();

      await selectFiles([createFile('b.png', 'image/png')]);
      expect(fixture.nativeElement.querySelector('.preview')).toBeNull();
    });
  });

  describe('multiple input single-selection cap', () => {
    it('hides "add another URL" and keeps a single control when multiple is false', async () => {
      await selectUrlTab();
      expect(findButtonByText('Add another URL')).toBeUndefined();
      expect(urlInputs().length).toBe(1);
    });

    it('replaces rather than appends when a new file is selected and multiple is false', async () => {
      await selectFiles([createFile('a.png', 'image/png')]);
      await selectFiles([createFile('b.png', 'image/png')]);

      const payloads: FileUplinkSubmitPayload[] = [];
      component.submit.subscribe((payload) => payloads.push(payload));
      submitButton().click();

      expect(payloads[0].files?.map((file) => file.name)).toEqual(['b.png']);
    });

    it('shows "add another URL" when multiple is true', async () => {
      await fixture.componentRef.setInput('multiple', true);
      await selectUrlTab();

      expect(findButtonByText('Add another URL')).toBeDefined();
    });

    it('appends files rather than replacing when multiple is true', async () => {
      await fixture.componentRef.setInput('multiple', true);

      await selectFiles([createFile('a.png', 'image/png')]);
      await selectFiles([createFile('b.png', 'image/png')]);

      const payloads: FileUplinkSubmitPayload[] = [];
      component.submit.subscribe((payload) => payloads.push(payload));
      submitButton().click();

      expect(payloads[0].files?.map((file) => file.name)).toEqual(['a.png', 'b.png']);
    });
  });
});
