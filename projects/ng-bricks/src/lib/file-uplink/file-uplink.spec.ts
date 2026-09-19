import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FileUplink } from './file-uplink';

describe('FileUplink', () => {
  let component: FileUplink;
  let fixture: ComponentFixture<FileUplink>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileUplink],
    }).compileComponents();

    fixture = TestBed.createComponent(FileUplink);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
