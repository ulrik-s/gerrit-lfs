// Copyright (C) 2025 The Android Open Source Project
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package com.googlesource.gerrit.plugins.lfs;

import com.google.common.base.Strings;
import com.google.gerrit.entities.Project;
import com.google.gerrit.extensions.restapi.ResourceConflictException;
import com.google.gerrit.extensions.restapi.ResourceNotFoundException;
import com.google.gerrit.extensions.restapi.Response;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gerrit.extensions.restapi.RestModifyView;
import com.google.gerrit.server.git.meta.MetaDataUpdate;
import com.google.gerrit.server.config.AllProjectsName;
import com.google.gerrit.server.permissions.PermissionBackend;
import com.google.gerrit.server.permissions.PermissionBackendException;
import com.google.gerrit.server.permissions.ProjectPermission;
import com.google.gerrit.server.project.ProjectResource;
import com.google.inject.Inject;
import com.google.inject.Provider;
import com.google.inject.Singleton;
import java.io.IOException;
import java.util.Set;
import org.eclipse.jgit.errors.ConfigInvalidException;
import org.eclipse.jgit.errors.RepositoryNotFoundException;

@Singleton
class PutLfsProjectConfig implements RestModifyView<ProjectResource, LfsProjectConfigInput> {
  private final Provider<MetaDataUpdate.User> metaDataUpdateFactory;
  private final LfsConfigurationFactory lfsConfigFactory;
  private final GetLfsProjectConfig get;
  private final PermissionBackend permissionBackend;
  private final AllProjectsName allProjectsName;

  @Inject
  PutLfsProjectConfig(
      Provider<MetaDataUpdate.User> metaDataUpdateFactory,
      LfsConfigurationFactory lfsConfigFactory,
      GetLfsProjectConfig get,
      PermissionBackend permissionBackend,
      AllProjectsName allProjectsName) {
    this.metaDataUpdateFactory = metaDataUpdateFactory;
    this.lfsConfigFactory = lfsConfigFactory;
    this.get = get;
    this.permissionBackend = permissionBackend;
    this.allProjectsName = allProjectsName;
  }

  @Override
  public Response<LfsProjectConfigInfo> apply(ProjectResource resource, LfsProjectConfigInput input)
      throws RestApiException {
    Project.NameKey projectName = resource.getNameKey();
    try {
      permissionBackend
          .user(resource.getUser())
          .project(projectName)
          .check(ProjectPermission.WRITE_CONFIG);
    } catch (PermissionBackendException e) {
      throw new RestApiException("Cannot verify project permissions", e);
    }

    if (input == null) {
      input = new LfsProjectConfigInput();
    }

    LfsProjectsConfig projectsConfig = lfsConfigFactory.getProjectsConfig();
    try (MetaDataUpdate md = metaDataUpdateFactory.get().create(allProjectsName)) {
      try {
        projectsConfig.load(md);
      } catch (ConfigInvalidException | IOException e) {
        throw new ResourceConflictException("Cannot read LFS config in All-Projects");
      }

      if (Boolean.TRUE.equals(input.remove)) {
        projectsConfig.removeNamespace(projectName.get());
      } else {
        if (!Strings.isNullOrEmpty(input.backend)) {
          Set<String> backends = lfsConfigFactory.getGlobalConfig().getBackends().keySet();
          if (!backends.contains(input.backend)) {
            throw new ResourceConflictException(
                String.format(
                    "Project %s: backend %s does not exist", projectName.get(), input.backend));
          }
        }
        projectsConfig.upsertNamespace(projectName.get(), input);
      }

      try {
        projectsConfig.commit(md);
      } catch (IOException e) {
        if (e.getCause() instanceof ConfigInvalidException) {
          throw new ResourceConflictException(
              "Cannot update LFS config in All-Projects: " + e.getCause().getMessage());
        }
        throw new ResourceConflictException("Cannot update LFS config in All-Projects");
      }
    } catch (RepositoryNotFoundException e) {
      throw new ResourceNotFoundException(projectName.get(), e);
    } catch (IOException e) {
      throw new ResourceNotFoundException(projectName.get(), e);
    }

    return get.apply(resource);
  }
}
