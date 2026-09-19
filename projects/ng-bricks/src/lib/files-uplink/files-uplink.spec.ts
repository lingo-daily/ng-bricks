import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FilesUplink } from './files-uplink';

describe('FilesUplink', () => {
  let component: FilesUplink;
  let fixture: ComponentFixture<FilesUplink>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilesUplink],
    }).compileComponents();

    fixture = TestBed.createComponent(FilesUplink);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
