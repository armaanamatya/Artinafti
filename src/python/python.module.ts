import { Module, Global } from '@nestjs/common';
import { PythonExecutorService } from './python-executor.service';

@Global()
@Module({
  providers: [PythonExecutorService],
  exports: [PythonExecutorService],
})
export class PythonModule {}
